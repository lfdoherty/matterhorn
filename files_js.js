"use strict";

var zlib = require('zlib')
var pathModule = require('path')
var fs = require('fs')

var _ = require('underscorem')

var reqs = require('./reqs')

var u = require('./util')

var urlsForJs = {}
var jsMappings = {}

//hostFile(url, type, content, gzippedContent)
//unhostFile(url)
exports.load = function(app, jsName, hostFile, unhostFile, cb){
	_.assertLength(arguments, 5)

	//console.log('beginning loading: ' + jsName)
	var resolvedName = reqs.resolve(app, jsName, 'js')
	//console.log('loading: ' + resolvedName.name)
	loadAndWrapJs(resolvedName.name, resolvedName.module, hostFile, unhostFile, function(err, res){
		//console.log('here: ' + resolvedName.name)
		if(err){ cb(err); return}
		function includeFunction(){
			//var urlLists = urlsForJs[resolvedName.name];
			//var urls = []
			//console.log('including: ' + resolvedName.name + ' ' + require('util').inspect(urlLists, 6))
			
			var all = getAll(urlsForJs[resolvedName.name])			
			all.unshift(headerUrls[resolvedName.name])
			return all
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
				all.push(sub)
			}
		})
	}
	lists.forEach(includeList)
	//console.log(JSON.stringify(all, null, 2))
	return all
}

var oldWrappedJs = {}

var headerUrls = {}
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
	var headerUrl = '/static/h/'+hash+'/'+name.substr(0, name.length-3)+'_header.js'
	var oldHeaderUrl = headerUrls[path]
	if(oldHeaderUrl) unhostFile(oldHeaderUrl)
	zlib.gzip(headerSource, function(err, zippedHeader){
		if(err) throw err;
		hostFile(headerUrl, 'js', headerSource, zippedHeader)
	})
	headerUrls[path] = headerUrl
}
			
function getSymbol(path){
	var name = pathModule.basename(path)
	var symbolHash = u.hashStr(path)
	var symbol = '_' + name.replace(/-/gi,'').replace(/\./gi,'_') + symbolHash
	return symbol
}
var loadAndWrapJs = _.memoizeAsync(function(path, app, hostFile, unhostFile, cb){
	_.assertString(path)
	
	var lastModTime;
	if(oldWrappedJs[path] === undefined){
		fs.watchFile(path, function (curr, prev) {
			if(curr.mtime > prev.mtime){
				console.log('updating file: ' + path);

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
		
			var includedMappings = jsMappings[path] = [[symbol]]

			var mapping = {}		
			
			var reqCdl = _.latch(requirements.length, 500, function(){

				//console.log('replacing requires ' + path)
				var hash = u.hashStr(str)
				result.url = '/static/f/'+hash+'/'+name
				var changedSource = reqs.replaceRequires(str, mapping)
				
				selfUrlList[0] = result.url
				
				var wrappedSource = 
					'(function(exports, module, global){\n' + 
					changedSource +
					'})(' + symbol + ', ' + symbol + '._module_wrapper,window)\n'+
					'if('+symbol+'._module_wrapper.exports !== ' + symbol + ') ' + symbol+'='+symbol+'._module_wrapper.exports;'
					
				result.unzipped = wrappedSource
				
				//console.log('zipping ' + symbol)
				zlib.gzip(wrappedSource, function(err, data){
					if(err) throw err;

					//console.log('...done zipping ' + symbol)
					result.zipped = data
				
					
					
					//console.log('loaded ' + path + ' -> ' + result.url)

					if(oldWrappedJs[path]){
						var oldUrl = oldWrappedJs[path].url
						unhostFile(oldUrl);
						var kk = Object.keys(urlsForJs)
						kk.forEach(function(k){
							var urls = urlsForJs[k]
							var ii = urls.indexOf(oldUrl)
							if(ii !== -1){
								urls.splice(ii, 1, result.url)
							}
						})
					}
					hostFile(result.url, 'js', wrappedSource, data)

					oldWrappedJs[path] = result
					
					cb(undefined, result)
				})
			}, function(){
				console.log('failed to finish loading: ' + path)
			})

			setTimeout(function(){
				computeHeader(hostFile, unhostFile, path, name)
			}, 500)
		
			requirements.forEach(function(req){

				var r = reqs.resolve(app, req, 'js', pathModule.dirname(path), path)
				if(r === undefined){//means reqs.resolve decided it wasn't a valid require statement
					reqCdl()
					return
				}
				var firstTime = true
				
				mapping[r.originalName] = getSymbol(r.name)

				var urlsForOther = urlsForJs[r.name]
				if(urlsForOther === undefined) urlsForOther = urlsForJs[r.name] = []
				if(allUrls.indexOf(urlsForOther) === -1) allUrls.push(urlsForOther)

				loadAndWrapJs(r.name, r.module, hostFile, unhostFile, function(err, rm){
					if(err) throw err
					_.assertString(r.originalName)

					_.assertArray(urlsForOther)

					includedMappings.push(jsMappings[r.name])
				})

				reqCdl()
			})
			allUrls.push(selfUrlList)			
		})
	}
})

