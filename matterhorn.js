
require('module_resolve')

var sys = require('util'),
	fs = require('fs'),
	pathModule = require('path'),
	crypto = require('crypto');

var _ = require('underscorem');

var uglify = require('uglify-js');
var stylus = require('stylus');

//var browserify = require('browserify');
var watchify = require('watchify')
//var tagify = require('tagify');
var ignoreit = require('ignoreit')

var zlib = require('zlib');

var changedetector = require('./changedetector');
//var jsFiles = require('./files_js')
var cssFiles = require('./files_css')
var fragmentFiles = require('./files_fragments')
var utilFiles = require('./util')

var random = require('seedrandom');

function getMimeType(type){
	if(type === 'js') return 'text/javascript';
	else if(type === 'css') return 'text/css';
	else if(type === 'template') return 'text/javascript';
	else if(type === 'json') return 'application/json';
	else if(type === 'fragment') return 'text/plain';
	else{
		_.errout('mime type unknown for type(' + type + ')');
	}
}

var http = require('http')
var https = require('https')

var quicklog = require('quicklog')

var log = quicklog.make('matterhorn/main')

var redirHeader = '<html><head><script>'+
	'hostName = window.location.host;'+
	'if(hostName.indexOf(":") !== -1) hostName = hostName.substr(0, hostName.indexOf(":"));'+
	'window.location = "';
var redirFooter = '";</script></head><body><noscript>Javascript is disabled.  Please enable Javascript to use this site.</noscript></body></html>';

var claimedSecure = {};
getApplication = function(moduleName){
	if(apps[moduleName] === undefined){
		log(JSON.stringify(Object.keys(apps)));
	}
	return apps[moduleName];
}
var methods = ['get', 'post', 'page', 'imagery', 'stub', 'serveJavascript', 'serveJavascriptFile'];


var alogs = {};
function alog(appName, type, msg){
	_.assertString(appName);
	var key = appName+':'+type;
	if(alogs[key] === undefined){
		alogs[key] = quicklog.make('matterhorn/'+appName + '-'+type)//fs.createWriteStream(appName + '-' + type + '.log');
	}
	alogs[key](msg);
}

exports.load = function(config, cb){

	prepare(config, function(local, after){
		cb(local.getServer(), local.getSecureServer(), after)
	})
}

exports.do304IfSafe = function(req, res){

	var chromeException = (req.header('User-Agent') && req.header('User-Agent').indexOf('Chrome')) !== -1 && 
		req.header('Cache-Control') === 'max-age=0';
	
	if((req.header('Cache-Control') !== undefined && !chromeException) || req.header('Expires') !== undefined){
		res.header('Content-Type', '');
		res.send(304);
		return true;
	}
}
function serveFile(req, res, type, content, gzippedContent, etag){
	_.assertLength(arguments, 6);
	_.assertBuffer(content)
	//_.assertBuffer(content)
	
	if(exports.do304IfSafe(req, res)){
		return;
	}
	/*
	//this bit here is to work around a Chrome bug
	var chromeException = 
		(req.header('User-Agent') && req.header('User-Agent').indexOf('Chrome')) !== -1 && 
		req.header('Cache-Control') === 'max-age=0';
	
	if((req.header('Cache-Control') !== undefined && !chromeException) || req.header('Expires') !== undefined){
		//console.log('headers: ' + JSON.stringify(req.headers));
		res.header('Content-Type', '');
		res.send(304);
	}else{
*/
		/*var headers = {
			'Cache-Control': 'public max-age=2592000', 
			'Expires': 'Sat, 28 Apr 2100 10:00:00 GMT',
			'Content-Type': getMimeType(type) + ';charset=utf-8'};*/
		res.header('Cache-Control', 'public max-age=2592000')
		res.header('Expires', 'Sat, 28 Apr 2100 10:00:00 GMT')
		res.header('Content-Type', getMimeType(type) + ';charset=utf-8')

		res.header('ETag', etag)
		
		var fileContents;

		var compHeader = req.header('Accept-Encoding');
		//console.log('accepting: ' + compHeader)
		if(compHeader && compHeader.indexOf('gzip') !== -1 && gzippedContent !== undefined){
			fileContents = gzippedContent;
			//headers['Content-Encoding'] = 'gzip';
			res.header('Content-Encoding', 'gzip')
		}else{
			//console.log('sending unzipped')
			fileContents = content
		}
		
		if(fileContents === undefined){
			_.errout('file contents missing for ' + path);
		}
		//console.log('looking for file: ' + app.name + ':' + name);
	/*	
		
		if(chromeException){
			headers['Warning'] = 'Working around Chrome 304 bug';
		}*/
		res.send(fileContents);
	//}
}
		
function prepare(config, cb){

	_.assertLength(arguments, 2);

	_.assertString(config.name);
	
	config.env = config.env || 'development';
	config.port = config.port || 80;
	config.securePort = config.securePort || 443;
	config.host = config.host || 'localhost';
	config.prefix = config.prefix || '';
	
	var appName = config.name;
	var hostName = config.host;
	var envType = config.env;

	InDebugEnvironment = config.env === 'development';

	var generators = {
		imagery: {}
	};

	function imageryImportFunction(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p){

		//console.log('*args: ' + JSON.stringify(arguments));

		var args = Array.prototype.slice.call(arguments);

		//console.log('args: ' + JSON.stringify(args));

		var moduleName = args.shift();
		var cssName = args.shift();

		var argValues = [];
		
		//console.log('args: ' + JSON.stringify(args));

		_.each(args, function(arg){
			if(arg.string !== undefined){
				argValues.push(arg.string);
			}else if(arg.val !== undefined){
				argValues.push(arg.val);
			}else if(arg.raw !== undefined || arg.rgba !== undefined){

				var v = [arg.r/256, arg.g/256, arg.b/256, arg.a];
				argValues.push(v);
			}else{
				throw 'unknown arg format: ' + sys.inspect(arg);
			}
		});
		

		var name = argValues[0];
		var params = argValues.slice(1);

		//calling the imagery function sets up the get endpoint with the generator defined by params,
		//and returns the url path of the endpoint.

		var genFunction = generators.imagery[name];

		if(genFunction === undefined){
			_.errout('no imagery generator defined called ' + name + ', error in ' + moduleName + ':' + cssName + '.css');
		}

		var url = (config.prefix || '') + genFunction(params);

		return new stylus.nodes.String(url);
	}
	//imageryImportFunction.raw = true;
	
	var serverStateId;
	
	function resetServerStateId(){
		serverStateId = ''+Math.floor(Math.random()*1000*1000);
		log('server state uid: ' + serverStateId);
	}
	resetServerStateId();

	/*
	30    black foreground
	31    red foreground
	32    green foreground
	33    brown foreground
	34    blue foreground
	35    magenta (purple) foreground
	36    cyan (light blue) foreground
	37    gray foreground

	40    black background
	41    red background
	42    green background
	43    brown background
	44    blue background
	45    magenta background
	46    cyan background
	47    white background

	*/
	var green = 32;
	var brown = 33;
	var blue = 34;
	var purple = 35;
	var red = 31;
	var cyan = 36;
	function colourize (msg, color) {
	  return msg ? "\033["+color+"m"+msg+"\033[0m" : ""
	}


	log('\n\nLoading matterhorn app as main application: ' + appName + '\n');

	var hosted = {};
	var unhosted = {};
	
	var hostedContent = {};
	var hostedZippedContent = {};
	var types = {}
	var etags = {}
	
	var dynamicJavascript = {}
	
	function hostFile(url, type, content, gzippedContent, etag){
		//_.assertLength(arguments, 5)
		_.assertBuffer(content)
		
		delete unhosted[url];
		hostedContent[url] = content;
		hostedZippedContent[url] = gzippedContent;
		types[url] = type
		etags[url] = etag
		console.log('hosting: ' + url)
		if(!hosted[url]){
			hosted[url] = true;
		}
		return function(newContent, newGzippedContent){
			_.assertBuffer(newContent)
			hostedContent[url] = newContent
			hostedZippedContent[url] = newGzippedContent
		}
	}
	function unhostFile(url){
		//console.log('unhosting ' + url)
		unhosted[url] = true;
	}
	
	function makeExpressWrapper(wrapper){


		function makeWrappingParts(app, expressApp, pageDef, title, /*includeJs, */includeCss, iconUrl){
			//_.assertFunction(includeJs)
			
			var header = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" ' + 
				'"http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">\n'+
				'<html xmlns="http://www.w3.org/1999/xhtml">\n'+
				'<head><meta http-equiv="Content-type" content="text/html;charset=UTF-8"/>\n<title>' + title + '</title>';
			
			includeCss().forEach(function(url){
				header += '<link type="text/css" rel="stylesheet" href="' + config.prefix + url + '"></link>';
			});
			if(pageDef.externalCss){
				pageDef.externalCss.forEach(function(url){
					header += '<link type="text/css" rel="stylesheet" href="' + url + '"></link>';
				});
			}
			//console.log('including fragments')
			/*includeJs.includeFragments().forEach(function(e){
				
				header += '<script type="text/javascript" src="' + config.prefix + e.url + '"></script>';
			})*/
	
			var headerEnd = ''
			if(pageDef.icon){
				headerEnd += '<link rel="shortcut icon" href="' + iconUrl + '" />';
			}

			headerEnd += '</head><body>'
		
			var middle = '';
			
			/*if(includeJs){
				var toInclude = includeJs()
				//console.log(JSON.stringify(toInclude, null, 2))
				toInclude.forEach(function(url){
					middle += '<script type="text/javascript" src="' + config.prefix + url + '"></script>';
				});
			}*/

			var footer = '</body></html>';
			
			var jsDetectorCookieJs = '';//changedetector.getDetectorStr(expressApp, app, config, serverStateId);
			
			var loggingJs = '';
			loggingJs += '<script>';
			loggingJs += 'if(typeof(console) === "undefined") console = {log: function(){}};';
			loggingJs += 'function log(str){console.log(str);}';
			loggingJs += '</script>';
			
			
			return {
				headerStart: header,
				headerEnd: headerEnd,
				javascript: middle + loggingJs + jsDetectorCookieJs,
				footer:footer
			};
		}

		function makeTypeCollectionMethod(type){
			return function(app, externalName, def){
				_.assertLength(arguments, 3);
				
				if(type === 'js'){
					var name = typeof(def) === 'string' ? def : def[0];
					files.publishJs(app, externalName, def);

					//console.log(config.port + ' ' + (wrapper.isSecure ? 'https ' : 'http ') + colourize(app.name, cyan) + ' js published ' + colourize(name, green) + ' -> ' + colourize(externalName, green));
					
				}else if(type === 'css'){
				
					var name = def;
					files.publishCss(app, externalName, name);
					
					//console.log(config.port + ' ' + (wrapper.isSecure ? 'https ' : 'http ') + colourize(app.name, cyan) + ' css published ' + colourize(name, green) + ' -> ' + colourize(externalName, green));
					
				}else _.errout('unknown type: ' + type);
			};
		}
		
		var get = wrapper.get;
		var post = wrapper.post;

		var hostedForWrapperYet = {}
		function hostForWrapper(url){
			if(url.indexOf('?') !== -1) url = url.substr(0, url.indexOf('?'))
			if(hostedForWrapperYet[url]) return
			
			hostedForWrapperYet[url] = true;
			
			console.log('hosting url(' + wrapper.isSecure+'): ' + url)
			//console.log(JSON.stringify(Object.keys(hostedContent)))

			wrapper.get(url, function(req, res){
			
				if(unhosted[url]){
					res.send(410);
				}else{
					if(!hostedContent[url]){
						_.errout('no hosted content for url: ' + url)
					}
					_.assertDefined(hostedContent[url])
					serveFile(req, res, types[url], hostedContent[url], hostedZippedContent[url], etags[url]||'"#"');
				}
			});
		}
		
		var pageLookup = {}
		
		wrapper.extendPage = function(app, pageUrl, jsFilePath){
			//_.errout('TODO')
			var page = pageLookup[pageUrl]
			if(!page){
				_.errout('cannot locate page, may not be defined yet (or ever?): ' + pageUrl)
			}
			
			page.extendPage(app, jsFilePath)
		}

		wrapper.page = function(app, pageDef){

			//if(pageDef.js === undefined) pageDef.js = [];
			//if(pageDef.css === undefined) pageDef.css = [];
		
			//if(_.isString(pageDef.js)) pageDef.js = [pageDef.js];
			//if(_.isString(pageDef.css)) pageDef.css = [pageDef.css];
			log('processing page: ' + pageDef.url)
			//console.log(JSON.stringify(pageDef))
			
			/*var resolve = require('resolve')
			var modulePath = pathModule.dirname(app.module.filename)
			var realPath
			try{
				realPath = resolve.sync(pageDef.js, { basedir: modulePath})
			}catch(e){
				realPath = resolve.sync(pageDef.js, { basedir: modulePath+'/js'})
			}
			var name = pathModule.basename(realPath)
			var jsUrl = '/static/f/bundle_'+name//+'.js'
			
			
			//var realContent
			;*/

			var realContentBuf
			var hash
			var fullJsUrl

			var modulePath = pathModule.dirname(app.module.filename)
			//console.log('modulePath: ' + modulePath)
			
			var resolved = pathModule.resolve(modulePath+'/'+pageDef.js)

			var name = pathModule.basename(resolved+'.js')
			
			var jsUrl = '/static/f/bundle_'+name//+'.js'
			
			wrapper.get(jsUrl, function(req, res){
				function finish(){
					if(!realContentBuf){
						setTimeout(finish, 1000)
						return
					}
					serveFile(req, res, 'js', realContentBuf, undefined, '#'+hash)//etags[url]||'"#"');
				}
				finish()
			})

			var opts = {
				//transformKey: function(){
				//	throw new Error('TODO')
				//}
			}
			var b = watchify(resolved, opts)
			b.transform(ignoreit)
			b.on('update', function (ids){
				buildBundle()
			})
			
			function buildBundle(){
				//b.register(ignorify);
			//	b.use(tagify)
				
				/*var allWatchers = []
				function closeAllWatchers(){
					allWatchers.forEach(function(w){
						w.close()
					})
				}*/
				
				
				/*b.on('file', function (file, id, parent){
					//fs.watchFile(file, {interval: 200}, function (curr, prev) {
					var watcher = fs.watch(file, function(event, filename){
						if(event === 'change'){
							closeAllWatchers()
							buildBundle()
						}
					})
					allWatchers.push(watcher)
				})*/
				
				
				
				var bundle = b.bundle({debug: true}, function(err, res){
					if(err) throw err
					//console.log(res.length)//JSON.stringify(res))
					hash = utilFiles.hashStr(res)
					fullJsUrl = jsUrl + '?h='+hash
					console.log('bundle url: ' + fullJsUrl)
					//hostForWrapper(jsUrl)
				
					//realContent = res
					realContentBuf = new Buffer(res)
					//var resBuf = new Buffer(res)
					//hostFile(jsUrl, 'js', new Buffer(res))
				})
			}
			buildBundle()
			
			if(pageDef.js) _.assertString(pageDef.js)
			if(pageDef.css) _.assertString(pageDef.css)
		
			var local = this;
		
			if(pageDef.url === undefined) _.errout('page definition must define a "url" parameter');

			_.assertString(pageDef.url);
			
			var includeJs
			var includeCss
			
			/*var extendIncludeFunctions = {}
			function realIncludeJs(){
				if(!includeJs) return []
				
				var arr = includeJs()
				Object.keys(extendIncludeFunctions).forEach(function(key){
					var f = extendIncludeFunctions[key]
					arr = arr.concat(f())
				})
				return arr
			}
			realIncludeJs.includeFragments = function(){
				if(includeJs){
					return includeJs.includeFragments()
				}else{
					return []
				}
			}*/
			
			function resolveDynamic(name){
				//_.errout('TODO: ' + name)
				name = name.substr(1)
				
				var s = dynamicJavascript[name]
				if(!s){
					_.errout('no dynamic javascript registered (yet?): ' + name)
				}
				return s
			}
			
			
			pageLookup[pageDef.url] = pageDef
			pageDef.extendPage = function(app, jsFilePath){
				var loaded = false
				jsFiles.load(app, jsFilePath, hostFile, unhostFile, log, resolveDynamic, function(err, includeJsFunc){
					if(err) _.errout(err);
					loaded = true
					
					//setTimeout(function(){includeJsFunc().forEach(hostForWrapper)},3000)
					//setTimeout(function(){includeJsFunc.includeFragments().forEach(function(obj){hostForWrapper(obj.url)})},3000)
					
					//_.assert(!loaded)//TODO can this ever happen?
					_.assertFunction(includeJsFunc)
					extendIncludeFunctions[jsFilePath] = includeJsFunc
				});
			}
			
			try{
			
				//console.log('loading files: ' + wrapper.isSecure + ' ' + pageDef.url)
				/*if(pageDef.js){
					jsFiles.load(app, pageDef.js, hostFile, unhostFile, log, resolveDynamic, function(err, includeJsFunc){
						if(err) _.errout(err);
						_.assertFunction(includeJsFunc)
						//console.log('got include: ' + wrapper.isSecure + ' ' + pageDef.url)
					
						setTimeout(function(){includeJsFunc().forEach(hostForWrapper)},3000)
						setTimeout(function(){includeJsFunc.includeFragments().forEach(function(obj){hostForWrapper(obj.url)})},3000)
					
						includeJs = includeJsFunc
					});

					setTimeout(function(){
						if(includeJs === undefined){
							_.errout('js files never finished loading: ' + pageDef.js)
						}
					}, 5000)

				}*/
				
				
				if(pageDef.css){
					cssFiles.load(app, pageDef.css, hostFile, unhostFile, imageryImportFunction, log, function(err, includeCssFunc){
						if(err) throw err
						
						_.assertFunction(includeCssFunc)
						
						setTimeout(function(){includeCssFunc().forEach(hostForWrapper)},1000)
						
						includeCss = includeCssFunc
					});
				}else{
					includeCss = function(){return [];}
				}
				
				/*if(pageDef.fragments){
					console.log('loading fragments')
					fragmentFiles.load(app, pageDef.fragments, hostFile.bind(undefined,app), unhostFile, log, function(err, includeFragmentsFunc){
						if(err) throw err
						includeFragments = includeFragmentsFunc
					})
				}else{
					includeFragments = function(){return [];}
				}*/
			}catch(e){
				sys.debug('error loading page: ' + pageDef.url);
				throw e;
			}			

			if(pageDef.root){
				_.errout('matterhorn no longer supports templates: ' + JSON.stringify(pageDef));
			}
			
			if(pageDef.icon){//TODO fix directory resolution to be relative to module dir
				var iconUrl = '/icon/'+pathModule.basename(pageDef.icon)
				var iconBuffer = fs.readFileSync(pageDef.icon)
				wrapper.get(iconUrl, function(req, res){
					res.setHeader('Content-Type', 'image/png')
					res.setHeader('Content-Length', iconBuffer.length)
					res.end(iconBuffer)
				})
			}
					
			function handler(req, res){
		
				if(pageDef.cb){
					log('waiting for cb reply for ' + pageDef.url);
					pageDef.cb(req, res, function(b, jsFiles){
						if(arguments.length === 0){
							log('Error 500, Internal Server Error - Reference Code: ' + res.uid);
							res.send('Error 500, Internal Server Error - Reference Code: ' + res.uid, 500);
						}else{
							log('got cb reply');
							finish(req, res, b, jsFiles);
						}
					});
				}else{
					finish(req, res, {});
				}
				
				function finish(req, res, b, jsFiles){
				
					jsFiles = jsFiles || [];
					
					if(!fullJsUrl){
						 setTimeout(function(){
						 	finish(req, res, b, jsFiles)
						 },1000)
						 return
					}
					for(var i=0;i<jsFiles.length;++i){
						if(typeof(jsFiles[i]) !== 'string'){
							 console.log('ERROR: jsFiles list contains non-string: ' + jsFiles[i]);
							 setTimeout(function(){
							 	finish(req, res, b, jsFiles)
							 },1000)
							 return
						}
					}

					jsFiles.push(fullJsUrl)
					
				
					if(b === undefined){
						return;
					}
					
					b.hasJs = !!req.cookies.hasjs;
					b.urlPrefix = config.prefix || '';
				

					var variableScript = '\n<script>\nif(!window.page) window.page = {};\npage.params = {\n';
					var first = true
					//_.each(b, function(value, attr){
					var bKeys = Object.keys(b)
					//.forEach(function(attr){
					for(var i=0;i<bKeys.length;++i){
						var attr = bKeys[i]
						var value = b[attr]
						if(value !== undefined){
							if(!first) variableScript += ','
							first = false
							variableScript += '"' + attr + '": '  + JSON.stringify(value) + '\n';
						}
					}
					variableScript += '\n}\n</script>\n';

					var extraJs = '';
					//_.each(jsFiles, function(jsFile){
					for(var i=0;i<jsFiles.length;++i){
						var jsFile = jsFiles[i]
						_.assertString(jsFile);
						extraJs += '<script src="' + (jsFile.indexOf('://') === -1 ? b.urlPrefix : '') + jsFile + '"></script>\n';
					}

					var title =  b.title || pageDef.title || app.name || ''
					//console.log('TITLE OPTIONS: ' + b.title + ' ' + pageDef.title + ' ' + app.name);
					
					var parts = makeWrappingParts(app, local, pageDef, title, /*realIncludeJs, */includeCss, iconUrl);
		
					var html = parts.headerStart + variableScript + parts.javascript + extraJs + parts.headerEnd + /*parts.javascript + extraJs + */parts.footer;

					res.header('Cache-Control', 'no-cache, no-store')
					res.header('Pragma', 'no-cache')
					res.header('Expires', '0')
					//res.send(html, {'Cache-Control': 'no-cache, no-store'}, 200);
					res.send(html, 200);
				}
			}

			var args = [pageDef.url].concat(pageDef.filters || []).concat(handler);
			if(pageDef.method && pageDef.method.toLowerCase() === 'post'){
				wrapper.post.apply(undefined, args);
			}else{
				wrapper.get.apply(undefined, args);
			}
		}
		
		wrapper.stub = function(){}
		
		/*wrapper.imagery = function(app, genName, mimeType, genFunction){
			
			_.assertLength(arguments, 4);
			
			var urlPrefix = '/img/' + app.name + '/' + genName + '/';

			function genCreatorFunction(params){
				//console.log('params: ' + JSON.stringify(params));
				var buffer;
				
				genFunction.apply(undefined, params.concat([cb]));
				
				function cb(buf){buffer = buf;}
				
				
				var paramStr = params.join(' ');

				var urlPattern = urlPrefix + files.computeHash(paramStr + serverStateId);
				
				wrapper.get(urlPattern, function(req, res){
					res.header('Cache-Control', 'public max-age=2592000')
					res.header('Expires', 'Sat, 28 Apr 2100 10:00:00 GMT')
					res.head('Content-Type', mimeType)
					res.send(buffer)
					
				});
				
				return urlPattern;
			}

			generators.imagery[genName] = genCreatorFunction;
			
			//console.log(config.port + ' ' + (wrapper.isSecure ? 'https ' : 'http ') + colourize(app.name, cyan) + ' imagery ' + colourize(genName, green));
			alog(appName, 'imagery', config.port + ' ' + (wrapper.isSecure ? 'https ' : 'http ') + app.name + ' imagery ' + genName);
		}*/

		
		function javascriptRedirect(res, url){
			res.send(redirHeader + config.prefix + url + redirFooter);
		}
		
		wrapper.get = function(path){
			_.assertString(path)
	
			path = wrapper.getSilent.apply(undefined, arguments);
			console.log(config.port + ' ' + (wrapper.isSecure ? 'https ' : 'http ') + ' get ' + colourize(path, green));
			
			alog(appName,'get',  (wrapper.isSecure ? config.securePort : config.port) + ' ' + (wrapper.isSecure ? 'https' : 'http') + ' get ' + path);
		}
		
		function makeRequestCbWrapper(path, type, cb){
			return function(req, res){
				res.javascriptRedirect = javascriptRedirect.bind(undefined, res);
			
				var uid = random.uid();
				req.uid = uid;
				res.uid = uid;
				//console.log(JSON.stringify(Object.keys(req)));
				log('+' + type + ' ' + req.url + ' ' + path + ' ' + uid);
				var startTime = Date.now()

				var oldEnd = res.end;
				res.end = function(){
					oldEnd.apply(this, Array.prototype.slice.call(arguments));
					var delay = Date.now() - startTime
					log('-' + type + ' ' + req.url + ' ' + path + ' ' + uid + ' ' + delay +'ms');
				}
			
				cb(req, res);
			}
		}
		
		wrapper.getSilent = function(path){
		
			//_.assertLength(arguments, 1)
			_.assertString(path)
	
			var args = Array.prototype.slice.call(arguments,0);
			args[0] = path = config.prefix + path;
			var cb = args[args.length-1];
			args[args.length-1] = makeRequestCbWrapper(path, 'GET', cb);
			get.apply(wrapper, args);

			return args[0];
		}
	
		wrapper.post = function(path){
			_.assertString(path)
			//_.assertLength(arguments, 1)

			var args = Array.prototype.slice.call(arguments,0);
			args[0] = path = config.prefix + path;

			var cb = args[args.length-1];
			args[args.length-1] = makeRequestCbWrapper(path, 'POST', cb);

			post.apply(wrapper, args);
			//console.log(config.port + ' ' + (wrapper.isSecure ? 'https ' : 'http ') + colourize(app.name, cyan) + ' post ' + colourize(path, green));
			//alog(appName, 'post', config.port + ' ' + (wrapper.isSecure ? 'https ' : 'http ') + colourize(app.name, cyan) + ' post ' + colourize(path, green));
			alog(appName, 'post', (wrapper.isSecure ? config.securePort : config.port) + ' ' + (wrapper.isSecure ? 'https' : 'http') + ' post ' + path);
		}
		
		
		wrapper.serveJavascriptFile = function(app, path){
			log('path: ' + path)
			_.assertLength(arguments, 2)
			//files.loadJsFile(app, path, name, hostFile, unhostFile, function(){
			if(path.indexOf('.js') === path.length-3){
				path = path.substr(0, path.length-3)
			}
			jsFiles.load(app, path, hostFile, unhostFile, log, function(err){
				if(err) throw err//_.errout('cannot find file to be served as "' + name + '" at path: ' + path);
				//TODO
				
				//setTimeout(function(){includeCssFunc().forEach(hostForWrapper)},1000)
				hostForWrapper(path)
			});				
			

			//console.log(config.port + ' ' + (wrapper.isSecure ? 'https ' : 'http ') + colourize(app.name, cyan) + ' serving-js-file ' + colourize(name, green));
			
			alog(appName,'js',config.port + ' ' + (wrapper.isSecure ? 'https ' : 'http ') + app.name + 
				' serving-js-file '/*+ name*/);
		}
		
		wrapper.serveJavascript = function(app, name, cb){
		
			var urlPrefix = '/js/'
			var url;
			var hash;
			var gzipped;

			var symbol = 'dynamic_' + name.replace(/-/gi,'').replace(/\./gi,'_')// + symbolHash
			
			cb(function(jsStr){

				jsStr = InDebugEnvironment ? jsStr : uglify(jsStr);
				
				jsStr = jsFiles.wrapJsSource(jsStr, symbol)

				var jsBuf = jsStr
				if(_.isString(jsBuf)) jsBuf = new Buffer(jsBuf)

				
				var hashStr = utilFiles.hashStr(jsStr);
				if(hashStr !== hash){

					url = urlPrefix+name+'.js?h='+hashStr;
					
					var hostUrl = urlPrefix+name+'.js'
					
					//var symbolHash = u.hashStr()
					
					console.log('registered dynamic javascript: ' + name + ' ' + url)

					dynamicJavascript[name+'.js'] = {symbol: symbol, url: url, hash: hashStr}
					
					hostFile(hostUrl, 'js', jsBuf, gzipped, '');
					hostForWrapper(url)
					
					/*zlib.gzip(jsBuf, function(err, data){
						if(err) _.errout(err);
						gzipped = data;
						log('zipped ' + name + ' ' + data.length + ' from ' + jsStr.length + ' chars');
					
						hash = hashStr;

						hostFile(url, 'js', jsBuf, gzipped, '');
						hostForWrapper(url)
					});*/
				}
				
				return url;

			});
		}
	
		wrapper.serveJson = function(name, cb){
			_.assertString(name)
			var urlPrefix = '/json/'// + app.name +'/';
			var url;
			var hash;
			var gzipped;

			cb(function(jsonStr){

				//jsonStr = InDebugEnvironment ? jsonStr : uglify(jsonStr);

				var jsonBuf = jsonStr
				if(_.isString(jsonBuf)) jsonBuf = new Buffer(jsonBuf)
				
				var hashStr = utilFiles.hashStr(jsonStr);
				if(hashStr !== hash){

					url = urlPrefix+hashStr+'/'+name+'.json';
					hostFile(url, 'json', jsonBuf, gzipped, '');
				
					zlib.gzip(jsonBuf, function(err, data){
						if(err) _.errout(err);
						gzipped = data;
						log('zipped ' + name + ' ' + data.length + ' from ' + jsonStr.length + ' chars');
					
						hash = hashStr;

						hostFile(url, 'json', jsonBuf, gzipped, '');
						hostForWrapper(url)
					});
				}
				
				return url;

			});
		}
		return wrapper;
	}

	var express = require('express');
	//var connect = require('connect')

	//make express secure app actually secure
	var privateKey, certificate;
	var gotHttpsStuff = false;
	/*try{
		privateKey = fs.readFileSync(process.cwd() + '/privatekey.pem').toString();
		certificate = fs.readFileSync(process.cwd() + '/certificate.pem').toString();
		gotHttpsStuff = true;
	}catch(e){
		console.log("WARNING: Https access disabled, since one or both of privatekey.pem and certificate.pem were not found or could not be read");
	}*/	
	
	gotHttpsStuff = gotHttpsStuff || config.makeSecureServerHttp
	
	if(!config.disableHttp){
		var localApp = express()
		var MaxFileSizeGlobalBytes = '1024mb'
		var multipartConfig = {
			uploadDir: './files',
			keepExtensions: true,
			limit: MaxFileSizeGlobalBytes
		}
	
		localApp.use(express.json());
		localApp.use(express.urlencoded());
		localApp.use(express.multipart(multipartConfig));
		localApp.use(express.cookieParser())

	
		localApp.settings.env = envType;
	
		localApp.settings.port = config.port;

		makeExpressWrapper(localApp);

		localApp.set('host', 'http://' + hostName);
		localApp.set('securehost', 'https://' + hostName);

		if(envType === 'development'){
			localApp.post('/serverchanged', serverChangedCb);
		}

		localApp.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
	}

	function serverChangedCb(req, res){

		var start = Date.now();
		var expectedId = req.body.id;
	
		function tryFunc(){

			if(expectedId !== serverStateId){
				res.send('r');
			}else if(Date.now() - start > 30*1000){
				res.send('');				
			}else{
				setTimeout(tryFunc, 100);
			}
		}
		tryFunc();
	}

	if(gotHttpsStuff){

		var localSecureApp = express()
		var MaxFileSizeGlobalBytes = '1024mb'
		var multipartConfig = {
			uploadDir: './files',
			keepExtensions: true,
			limit: MaxFileSizeGlobalBytes
		}
	
		localSecureApp.use(express.json());
		localSecureApp.use(express.urlencoded());
		localSecureApp.use(express.multipart(multipartConfig));
		localSecureApp.use(express.cookieParser())

		
		if(config.makeSecureServerHttp){
			localSecureApp.enable('trust proxy')
		}
		 
		if(!config.disableHttp){
			localApp.settings.securePort = config.securePort;
		}

		localSecureApp.settings.env = envType;

		localSecureApp.use(express.errorHandler({ dumpExceptions: true, showStack: true }));

		makeExpressWrapper(localSecureApp);

		localSecureApp.isSecure = true;
		localSecureApp.set('host', 'http://' + hostName);
		localSecureApp.set('securehost', 'https://' + hostName);

		if(envType === 'development'){
			localSecureApp.post('/serverchanged', serverChangedCb);
		}
	}

	if(!config.disableHttp){	
		localApp.getPort = function(){
			return config.port;
		}
	}
	var local = {
		getServer: function(){
			return localApp;
		},
		getSecureServer: function(){
			if(localSecureApp){
				return localSecureApp;
			}else{
				var other = {}
				Object.keys(localApp).forEach(function(key){
					other[key] = function(){
						log('disabling secure component: ' + key + ' ' + require('sys').inspect(arguments))
					}
				})
				return other
			}
		},
		
		getPort: function(){
			return config.port;
		},
		getSecurePort: function(){
			return config.securePort;
		}//,
		//app: localApp
	};

	if(gotHttpsStuff){	
		/*local.getSecureServer = function(){
			return localSecureApp;
		}*/
		if(!config.makeSecureServerHttp){
			/*if(config.localOnly){
				var secureS = https.createServer({key: privateKey, cert: certificate}, localSecureApp)
				localApp.getSecureServer = function(){return secureS;}
			}else{*/
				var secureS = https.createServer({key: privateKey, cert: certificate}, localSecureApp)
				if(!config.disableHttp){
					localApp.getSecureServer = function(){return secureS;}
				}
			//}
		}else{
				var secureS = http.createServer(localSecureApp)
				if(!config.disableHttp){
					localApp.getSecureServer = function(){return secureS;}
				}
		}
	}	

	if(!config.disableHttp){
		if(config.localOnly){
			var s = http.createServer(localApp)
			localApp.getServer = function(){return s;}
		}else{
			var s = http.createServer(localApp)
			localApp.getServer = function(){return s;}
		}
	}
		
	function after(readyCb){	

		if(!config.disableHttp){
			localApp.javascriptRedirectToSecure = function(res, url){
				res.send(redirHeader + 'https://" + hostName + ":' + config.securePort + url + redirFooter);
			}
		}
		if(localSecureApp){
			localSecureApp.javascriptRedirectToInsecure = function(res, url){
				res.send(redirHeader + 'http://" + hostName + ":' + config.port + url + redirFooter);
			}
			localSecureApp.getPort = function(){
				return config.port;
			},
			localSecureApp.getSecurePort = function(){
				return config.securePort;
			}
		}
		if(!config.disableHttp){
			localApp.getPort = function(){
				return config.port;
			},
			localApp.getSecurePort = function(){
				return config.securePort;
			}
		}

		var cdl = _.latch(1 + (gotHttpsStuff ? 1 : 0), function(){

			log('\nlistening on port ' + config.port + httpsPart + '\n\n');
			//console.log('\nlistening on port ' + config.port + httpsPart + '\n');
			if(readyCb) readyCb();
		});
		
		//var evilCache = true
		
		var realPort = config.port
		var realSecurePort = config.securePort
		/*
		if(evilCache){
			realPort = 9483
			require('evil-http-cache').createServer(realPort, 'localhost', config.port)
			if(gotHttpsStuff && config.securePort !== 'none'){
				realSecurePort = 9484
				require('evil-http-cache').createServer(realSecurePort, 'localhost', config.securePort)
			}
		}*/
		
		if(!config.disableHttp){
			if(config.localOnly){
				//localApp.listen(config.port, '127.0.0.1', cdl);
				s.listen(realPort, '127.0.0.1', cdl);
				//http.createServer(s).listen(80);
			}else{
				//localApp.listen(config.port, cdl);
				console.log('http listening on ' + config.port)
				s.listen(realPort, cdl);
			}
		}
		var httpsPart = '';
		
		if(gotHttpsStuff && config.securePort !== 'none'){
			if(config.localOnly){
				//localSecureApp.listen(config.securePort, '127.0.0.1');
				secureS.listen(realSecurePort, '127.0.0.1', cdl);
			}else{
				secureS.listen(realSecurePort, function(){
					console.log('https listening on ' + config.securePort)
					cdl()
				});
				//localSecureApp.listen(config.securePort);
			}
			httpsPart = ' (and ' + config.securePort + '.)';
		}
		
		
		
		return function(cb){
			log('matterhorn app ' + config.name + ' shutting down as requested.');
			localApp.close();
			if(localSecureApp) localSecureApp.close();
			if(cb) cb();
		}
	}
	
	cb(local, after);
}

//exports.prepare = function(config, cb){ prepare(config, cb);}



