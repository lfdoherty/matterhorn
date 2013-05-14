var zlib = require('zlib')
var pathModule = require('path')
var fs = require('fs')
var crypto = require('crypto')

var stylus = require('stylus')

var _ = require('underscorem')

var reqs = require('./reqs')
var u = require('./util')

var urlFor = {}
var nameFor = {}
var hashFor = {}

exports.load = function(app, names, hostFile, unhostFile, logger, dirPath, cb){
	_.assertLength(arguments, 7)

	var funcs = []
	var cdl = _.latch(names.length, function(){
		function getFragments(){
			var res = []
			funcs.forEach(function(f){
				res.push(f())
			})
			//console.log('returning fragments: ' + JSON.stringify(res))
			return res
		}
		cb(undefined, getFragments)
	})
	
	names.forEach(function(name){
		var dp = dirPath
		dp = dp.substr(0,dp.lastIndexOf('/'))
		dp = dp.substr(0,dp.lastIndexOf('/'))
		var resolvedName = reqs.resolve(app, name, 'fragment', logger, dp, 'fragment')//'fragment', 'fragment')
	
		loadAndWrap(resolvedName.name, resolvedName.module, hostFile, unhostFile, logger, function(err){
			if(err){ cb(err); return}
						
			funcs.push(function(){
				return {
					originalName: name,
					name: nameFor[resolvedName.name]+'_'+hashFor[resolvedName.name],
					url: urlFor[resolvedName.name],
					shortName: nameFor[resolvedName.name]
				}
			})

			cdl()
		})	
	})
}

var loadAndWrap = _.memoizeAsync(function(path, app, hostFile, unhostFile, log, cb){
	_.assertString(path)
	_.assertFunction(log)
	
	//var urls = {}
	
	var lastModTime;
	fs.watchFile(path, {interval: 100}, function (curr, prev) {
		if(curr.mtime > prev.mtime){
			log('updating file: ' + path);
			//console.log('updating file: ' + path);

			lastModTime = curr.mtime
			refresh(function(res){
				//if(err) throw err
				if(lastModTime === curr.mtime){
					loadAndWrap.refresh(path, app)//(path, [res])
				}
			})
		}
	});
	refresh(cb)
	function refresh(cb){
		u.readFile.clear(path)
		u.readFile(path, function(text){
	
			text = text.replace(/\"/gi, '\\\"')
	
			var name = pathModule.basename(path)
			var shortName = name.substr(0, name.indexOf('.'))
			
			var hash = u.hashStr(text)

			var wrappedText = 'var __fragment_'+shortName+'__ = ""+\n'
			var lines = text.split('\n')
			lines.forEach(function(line, index){
				if(index > 0) wrappedText += '+\n'
				wrappedText += '"'+line+'\\n"'
			})
	
			var url = '/static/'+hash+'/'+name

			zlib.gzip(wrappedText, function(err, data){
				if(err) throw err;
				hostFile(url, 'fragment', new Buffer(wrappedText), data, '')
			})
		
			urlFor[path] = url

			nameFor[path] = shortName
			hashFor[path] = hash
			
			cb(undefined)
			
			//var requirements = extractCssRequires(cssSrc)
			//console.log('read src: ' + cssSrc)
		
			/*var includedUrls = {}

			var reqCdl = _.latch(requirements.length, function(){

				var name = pathModule.basename(path)
				
				transformStylusToCss(cssSrc, name, imageryFunction, function(changedSource){
					//console.log('changedSrc: ' + changedSource)
				
					var hash = u.hashStr(changedSource)
					var symbol = hash + '_' + name.substr(0, name.length-3)
					
					zlib.gzip(changedSource, function(err, data){
						if(err) throw err;
				
						result = {
							unzipped: changedSource,
							zipped: data,
							url: '/static/'+hash+'/'+name,
							included: includedUrls
						}
					
						log('loaded ' + path + ' -> ' + result.url)

						if(oldWrappedCss[path]){
							unhostFile(oldWrappedCss[path].url);
						}
						hostFile(result.url, 'css', changedSource, data)

						includedUrls[result.url] = true
						urlsForCss[path] = Object.keys(includedUrls)

						oldWrappedCss[path] = result
					
						cb(undefined, result)
					})
				})
			})
		
			requirements.forEach(function(req){

				var r = reqs.resolve(app, req, 'css', log)

				loadAndWrapCss(r.name, r.module,  hostFile, unhostFile, imageryFunction, log, function(rm, km){
					Object.keys(km.included).forEach(function(url){includedUrls[url] = true;})
					reqCdl()
				})

			})*/
		})
	}
})

/*
var openJs = _.memoizeAsync(function(path, cb){
	fs.readFile(path, 'utf8', function(err, str){
		if(err) throw err;
		cb(str)
	})
})*/


