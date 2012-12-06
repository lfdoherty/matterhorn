"use strict";

var zlib = require('zlib')
var pathModule = require('path')
var fs = require('fs')

var _ = require('underscorem')

var fragments = require('./files_fragments')

var reqs = require('./reqs')

var u = require('./util')

var urlsForJs = {}
var jsMappings = {}

var pathHashSuffix = {}

var fragmentGetters = {}
var fragmentMappings = {}

exports.load = function(app, jsName, hostFile, unhostFile, logger, cb){
	_.assertLength(arguments, 6)

	//console.log('beginning loading: ' + jsName)
	var resolvedName = reqs.resolve(app, jsName, 'js', logger)
	//console.log('loading: ' + resolvedName.name)
	loadAndWrapJs(resolvedName.name, resolvedName.module, hostFile, unhostFile, logger, function(err, res){
		//console.log('here: ' + resolvedName.name)
		if(err){ cb(err); return}
		function includeFunction(){
			var urlLists = urlsForJs[resolvedName.name];
			
			var all = getAll(urlsForJs[resolvedName.name])
			var real = [headerUrls[resolvedName.name].url+headerHashes[resolvedName.name]]
			for(var i=0;i<all.length;++i){
				var a = all[i]
				var full = a.url+pathHashSuffix[a.path]
				if(real.indexOf(full) === -1){
					real.push(full)
				}
			}
			return real
		}
		
		includeFunction.includeFragments = function(){
			//TODO
			//var arr = fragmentUrlsForJs[resolvedName.name] || []
			var arr = fragmentMappings[resolvedName.name] || []
			var all = getAll([arr])
			
			var res = []
			all.forEach(function(f){
				var v = f()
				v.forEach(function(r){
					res.push({url: r.url, name: r.name})
				})// = res.concat(r)
			})
			
			return res
			/*
			var res = fragmentGetters[resolvedName.name]()
			var urls = []
			res.forEach(function(r){
				urls.push({url: r.url, name: r.name})
			})
			return urls*/
			//res.forEach(
		}
		
		cb(undefined, includeFunction)
	})	
}

function getAll(lists){
	var all = []
	var has = []
	function includeList(list){
		has.push(list)
		list.forEach(function(sub){
			if(_.isArray(sub)){
				if(has.indexOf(sub) === -1){
					includeList(sub)
				}
			}
		})
		list.forEach(function(sub){
			if(!_.isArray(sub) && all.indexOf(sub) === -1){
				_.assertDefined(sub)
				all.push(sub)
			}
		})
	}
	lists.forEach(includeList)
	return all
}

var oldWrappedJs = {}

var headerUrls = {}
var headerHashes = {}
function computeHeader(hostFile, unhostFile, path, name){
	var all = getAll(jsMappings[path])
	var headerSource = ''
	var sorted = [].concat(all)
	sorted = sorted.sort()
	sorted.forEach(function(symbol){
		headerSource += 'var ' + symbol + ' = {_module_wrapper: {}};\n'
		headerSource += '' + symbol + '._module_wrapper = {parent: {exports: window}, exports: ' + symbol + '};\n'
	})
	var hash = u.hashStr(headerSource)
	var headerUrl = '/static/h/'+name.substr(0, name.length-3)+'_header.js?h='+hash
	var hostUrl = '/static/h/'+name.substr(0, name.length-3)+'_header.js'
	headerHashes[path] = '?h='+hash
	zlib.gzip(headerSource, function(err, zippedHeader){
		if(err) throw err;
		hostFile(hostUrl, 'js', new Buffer(headerSource), zippedHeader, '')
	})
	headerUrls[path] = {url: hostUrl, path: path}//headerUrl
}
			
function getSymbol(path){
	var name = pathModule.basename(path)
	var symbolHash = u.hashStr(path)
	var symbol = '_' + name.replace(/-/gi,'').replace(/\./gi,'_') + symbolHash
	return symbol
}
var loadAndWrapJs = _.memoizeAsync(function(path, app, hostFile, unhostFile, log, cb){
	_.assertString(path)
	_.assertFunction(log)
	_.assertFunction(cb)
	
	var lastModTime;
	if(oldWrappedJs[path] === undefined){
		fs.watchFile(path, {interval: 100}, function (curr, prev) {
			if(curr.mtime > prev.mtime){
				log('updating file: ' + path);

				lastModTime = curr.mtime
				refresh(function(err, res){
					if(err) throw err
					if(lastModTime === curr.mtime){
						loadAndWrapJs.refresh(path)
					}
				})
			}
		});
	}

	var name = pathModule.basename(path)
	//console.log('name: ' + path)
	var symbolHash = u.hashStr(path)
	var symbol = '_' + name.replace(/-/gi,'').replace(/\./gi,'_') + symbolHash
	
	var result = result = {
		unzipped: undefined,
		zipped: undefined,
		url: undefined,
		symbol: symbol,
		path: path
	}

	var selfUrlList = []
	
	var allUrls = urlsForJs[path]
	if(urlsForJs[path] === undefined) allUrls = urlsForJs[path] = []

	
	refresh(cb)
	function refresh(cb){
		u.readFile.clear(path)
		u.readFile(path, function(str){
			//console.log('extracting requires ' + path)
			var requirements = reqs.extractRequires(str)
			var fragmentRequirements = reqs.extractFragmentRequires(str)
			
			var includedMappings = jsMappings[path] = [[symbol]]
			
			
			//var includedFragments = fragmentUrlsForJs[path] = []

			var mapping = {}		
			var fragmentMapping = {}
			
			var reqCdl = _.latch(requirements.length, 500, function(){

				//console.log('replacing requires ' + path)
				var hash = u.hashStr(str)
				result.url = '/static/f/'+name+'?h='+hash
				result.hostUrl = '/static/f/'+name
				pathHashSuffix[path] = '?h='+hash
				var changedSource = reqs.replaceRequires(str, mapping, fragmentMapping)
				
				selfUrlList[0] = {url: result.hostUrl, path: path}
				
				var wrappedSource = 
					'(function(exports, module, global){' + 
					changedSource +
					'})(' + symbol + ', ' + symbol + '._module_wrapper,window)\n'+
					'if('+symbol+'._module_wrapper.exports !== ' + symbol + ') ' + symbol+'='+symbol+'._module_wrapper.exports;'
					
				result.unzipped = wrappedSource
				
				wrappedSource = new Buffer(wrappedSource)
				
				//console.log('zipping ' + symbol)
				zlib.gzip(wrappedSource, function(err, data){
					if(err) throw err;

					//console.log('...done zipping ' + symbol)
					result.zipped = data

					var hoster = oldWrappedJs[path]
						
					if(hoster){
						//console.log('refreshed hosted content for ' + result.hostUrl)
						hoster(wrappedSource, data)
					}else{
						hoster = oldWrappedJs[path] = hostFile(result.hostUrl, 'js', wrappedSource, data, '')
					}
					
					cb(undefined, result)
				})
			}, function(){
				log('failed to finish loading: ' + path)
			})

			setTimeout(function(){
				computeHeader(hostFile, unhostFile, path, name)
			}, 500)
		
			fragments.load(app, fragmentRequirements, hostFile, unhostFile, log, function(err, f){
				if(err) throw err
				fragmentGetters[path] = f
				var res = f()
				res.forEach(function(e){
					fragmentMapping[e.originalName] = '__fragment_'+e.shortName+'__'
				})

				_.assertDefined(fragmentGetters[path])
				var includedFragments = fragmentMappings[path] = [fragmentGetters[path]]

				//reqCdl()
				requirements.forEach(function(req){
				
					var r
					
					//if(req.indexOf('editlookup') !== -1) console.log(':'+req)
					var isJson = req.indexOf('.json') !== -1
					if(isJson){//path.length-4){
						//_.errout('eRWRwerlkwejrewlkrjwelrkjwerlkwje')
						r = reqs.resolve(app, req.substr(0,req.length-5), 'json', log, pathModule.dirname(path), path)
					}else{
						r = reqs.resolve(app, req, 'js', log, pathModule.dirname(path), path)
					}
					
					if(r === undefined){//means reqs.resolve decided it wasn't a valid require statement
						reqCdl()
						return
					}
					var firstTime = true
				
					var nameKey = r.originalName
					if(isJson){
						nameKey += '.json'
					}
					mapping[nameKey] = getSymbol(r.name)
					//console.log('name: ' + r.originalName)

					var urlsForOther = urlsForJs[r.name]
					if(urlsForOther === undefined) urlsForOther = urlsForJs[r.name] = []
					if(allUrls.indexOf(urlsForOther) === -1) allUrls.push(urlsForOther)

					loadAndWrapJs(r.name, r.module, hostFile, unhostFile, log, function(err, rm){
						if(err) throw err
						_.assertString(r.originalName)

						_.assertArray(urlsForOther)
					
						_.assertArray(jsMappings[r.name])
					
						includedMappings.push(jsMappings[r.name])
						_.assertArray(fragmentMappings[r.name])
						includedFragments.push(fragmentMappings[r.name])
					})

					reqCdl()
				})
				
				allUrls.push(selfUrlList)			
			})
			
			
		})
	}
})

