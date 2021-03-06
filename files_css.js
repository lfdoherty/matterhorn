//var zlib = require('zlib')
var pathModule = require('path')
var fs = require('fs')
var crypto = require('crypto')

var stylus = require('stylus')

var _ = require('underscorem')

var reqs = require('./reqs')
var u = require('./util')

var urlsForCss = {}
var hostUrlsForCss = {}

//hostFile(url, type, content, gzippedContent)
//unhostFile(url)
exports.load = function(app, name, hostFile, unhostFile, imageryFunction, logger, cb){
	_.assertLength(arguments, 7)

	var resolvedName = reqs.resolve(app, name, 'css', logger)
	loadAndWrapCss(resolvedName.name, resolvedName.module, hostFile, unhostFile, imageryFunction, logger, function(err, res){
		if(err){ cb(err); return}
		
		function includeFunction(){
			var urls = urlsForCss[resolvedName.name];
			_.assertArray(urls)
			return urls;
		}
		
		function hostUrlsFunction(){
			var urls = hostUrlsForCss[resolvedName.name];
			_.assertArray(urls)
			return urls;
		}
		
		cb(undefined, hostUrlsFunction, includeFunction)
	})	
}

var oldWrappedCss = {}

var CssImportsPrefix = "@import";

function extractCssRequires(cssContent){

	var res = []
	var lines = cssContent.split('\n');
	for(var i=0;i<lines.length;++i){
		var line = lines[i];
		if(line.indexOf(CssImportsPrefix) === 0 && line.indexOf('url(') === -1){

			var requirements = line.substr(CssImportsPrefix.length).split(' ');
			_.each(requirements, function(req){
			
				if(req.length === 0) return;
			
				var reqs = req.split(',');
				res = res.concat(reqs)
			});
		}
	}
	return res;
}

function cleanStylusContent(content){
	var lines = content.split('\n');
	for(var i=0;i<lines.length;++i){
		var line = lines[i];
		if(line.indexOf(CssImportsPrefix) === 0 && line.indexOf('url(') === -1){
			lines.splice(i, 1);
			--i;
		}
	}
	return lines.join('\n');
}

var cssParse = require('css-parse')

function stylusTransform(content, name, imageryImportFunction, cb){
	stylus(content).set('filename', name).define('imagery', imageryImportFunction).render(function(err, css){

		if (err){
		
			try{
				cssParse(content)
			}catch(e){
				if(e){
					console.log('** NOT CSS **')
					throw err
				}
			}
			
			console.log('STYLUS FAILED, FELL BACK TO CSS: ' + name)
			
			cb(content)
			return
		
			//throw err;
		}

		cb(css);
	});
}

function transformStylusToCss(content, name, imageryFunction, cb){
	content = cleanStylusContent(content);
	stylusTransform(content, name, function(a, b, c, d, e, f, g, h, i, j, k, l, m, n){
		var args = Array.prototype.slice.call(arguments);
		args = [content, name].concat(args);
		return imageryFunction.apply(undefined, args);
	}, cb);
}

var fileWatcher = {}

var loadAndWrapCss = _.memoizeAsync(function(path, app, hostFile, unhostFile, imageryFunction, log, cb){
	_.assertString(path)
	_.assertFunction(log)
	
	//var urls = {}
	
	if(fileWatcher[path]) fs.unwatchFile(path, fileWatcher[path])
	
	var lastModTime;
	function watcher(curr, prev) {
		if(curr.mtime > prev.mtime){
			console.log('updating file: ' + path);
			//console.log('updating file: ' + path);

			lastModTime = curr.mtime
			refresh(function(res){
				//if(err) throw err
				if(lastModTime === curr.mtime){
					loadAndWrapCss.refresh(path, app)//(path, [res])
				}
			})
		}
	}
	fileWatcher[path] = watcher
	fs.watchFile(path, {interval: 100}, watcher);
	refresh(cb)
	function refresh(cb){
		u.readFile.clear(path)
		u.readFile(path, function(cssSrc){
			var requirements = extractCssRequires(cssSrc)
			//console.log('read src: ' + cssSrc)
		
			var includedUrls = {}
			var includedHostUrls = {}
			
			var reqCdl = _.latch(requirements.length, function(){

				var name = pathModule.basename(path)
				
				transformStylusToCss(cssSrc, name, imageryFunction, function(changedSource){
					//console.log('changedSrc: ' + changedSource)
				
					var hash = u.hashStr(changedSource)
					var symbol = hash + '_' + name.substr(0, name.length-3)
					
					/*zlib.gzip(changedSource, function(err, data){
						if(err) throw err;*/
					setImmediate(function(){//TODO remove
				
						var headerUrl = '/static/h/'+hash+'/'+name// + '?h='+hash
						var hostUrl = '/static/h/:hash/'+name// + '?h='+hash
						
						result = {
							unzipped: changedSource,
							//zipped: data,
							url: headerUrl,//'/static/'+hash+'/'+name,
							included: includedUrls,
							includedHost: includedHostUrls
						}
					
						log('loaded ' + path + ' -> ' + result.url)
						
						var hoster = oldWrappedCss[path]
						if(hoster){
							hoster(new Buffer(changedSource), undefined)//data)
						}else{

							/*if(oldWrappedCss[path]){
								unhostFile(oldWrappedCss[path].url);
							}*/
							hoster = oldWrappedCss[path] = hostFile(hostUrl, 'css', new Buffer(changedSource), undefined, '')
						}

						includedUrls[result.url] = true
						includedHostUrls[hostUrl] = true
						//console.log('set urlsForCss: ' + path + ' ' + JSON.stringify(includedUrls))
						urlsForCss[path] = Object.keys(includedUrls)
						hostUrlsForCss[path] = Object.keys(includedHostUrls)

						//oldWrappedCss[path] = result
					
						cb(undefined, result)
					})
				})
			})
		
			requirements.forEach(function(req){

				try{
					var r = reqs.resolve(app, req, 'css', log, pathModule.dirname(path), path)
				}catch(e){
					console.log(e)
					reqCdl()
					return
				}
				
				loadAndWrapCss(r.name, r.module,  hostFile, unhostFile, imageryFunction, log, function(rm, km){
					Object.keys(km.included).forEach(function(url){includedUrls[url] = true;})
					Object.keys(km.includedHost).forEach(function(url){includedHostUrls[url] = true;})
					reqCdl()
				})

			})
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


