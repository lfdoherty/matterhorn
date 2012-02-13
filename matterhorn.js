
var sys = require('util'),
	fs = require('fs'),
	crypto = require('crypto');

var _ = require('underscorem');

var uglify = require('uglify-js');
var stylus = require('stylus');

var zlib = require('zlib');

var changedetector = require('./changedetector');
var files = require('./files');

var random = require('seedrandom');

function getMimeType(type){
	if(type === 'js') return 'text/javascript';
	else if(type === 'css') return 'text/css';
	else if(type === 'template') return 'text/javascript';
	else{
		_.errout('mime type unknown for type: ' + type);
	}
}

var apps = {};
var claimed = {};
var secureApps = {};

var claimedSecure = {};
getApplication = function(moduleName){
	return apps[moduleName];
}
var methods = ['get', 'post', 'js', 'css','page', 'imagery', 'stub', 'serveJavascript', 'serveJavascriptFile'];

function Facade(secure){
	this.secure = secure;
	var local = this;
	_.each(methods, function(m){
		var key = m+'__s';
		
		local[key] = [];
	});
}

_.each(methods, function(m){
	var key = m+'__s';
	Facade.prototype[m] = function(app){
		if(app.name === undefined){
			_.errout('first parameter of ' + m + '(...) call must be a module with "name" and "dir" properties.');
		}
		_.assertString(app.name);
		var c = claimed;
		var a = apps;
		if(this.secure){
			a = secureApps;
			c = claimedSecure;
		}
		if(a[app.name] !== undefined && a[app.name] !== app){
			if(app.requirements && app.requirements.length > 0){
				var otherApp = a[app.name];
				otherApp.requirements = otherApp.requirements || [];
				_.each(app.requirements, function(req){
					if(otherApp.requirements.indexOf(req) === -1){
						otherApp.requirements.push(req);
					}
				});
			}
		}else{
			a[app.name] = app;
			c[app.name] = new Error().stack;
		}
		if(this[key] === undefined) _.errout('missing list(' + key + ')');
		this[key].push(arguments);
	}
});

exports.do304IfSafe = function(req, res){

	var chromeException = (req.header('User-Agent') && req.header('User-Agent').indexOf('Chrome')) !== -1 && 
		req.header('Cache-Control') === 'max-age=0';
	
	if((req.header('Cache-Control') !== undefined && !chromeException) || req.header('Expires') !== undefined){
		res.header('Content-Type', '');
		res.send(304);
		return true;
	}
}
function serveFile(req, res, type, content, gzippedContent){
	_.assertLength(arguments, 5);
	
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
		var headers = {
			'Cache-Control': 'public max-age=2592000', 
			'Expires': 'Sat, 28 Apr 2100 10:00:00 GMT',
			'Content-Type': getMimeType(type) + ';charset=utf-8'};

		var fileContents;

		var compHeader = req.header('Accept-Encoding');
		if(compHeader && compHeader.indexOf('gzip') !== -1 && gzippedContent !== undefined){
			fileContents = gzippedContent;
			headers['Content-Encoding'] = 'gzip';
		}else{
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
		res.send(fileContents, headers);
	//}
}
		
app = new Facade();
secureApp = new Facade(true);

//var config = {name: appName, host: hostName, env: envType, port: port, securePort: securePort}
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
		console.log('server state uid: ' + serverStateId);
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


	console.log('\n\nLoading matterhorn app as main application: ' + colourize(appName, purple) + '\n');

	function makeExpressWrapper(wrapper){


		function makeWrappingParts(app, expressApp, pageDef, title){
			var header = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" ' + 
				'"http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">\n'+
				'<html xmlns="http://www.w3.org/1999/xhtml">\n'+
				'<head><meta http-equiv="Content-type" content="text/html;charset=UTF-8"/>\n<title>' + title + '</title>';
			
			files.includeCss(app, pageDef.css, function(url){
				header += '<link type="text/css" rel="stylesheet" href="' + config.prefix + url + '"></link>';
			});
	
			header += '</head><body>';
		
			var middle = '';
			
			files.includeJs(app, pageDef.js, function(url){
				middle += '<script type="text/javascript" src="' + config.prefix + url + '"></script>';
			});

			var footer = '</body></html>';
			
			var jsDetectorCookieJs = '';//changedetector.getDetectorStr(expressApp, app, config, serverStateId);
			
			var loggingJs = '';
			loggingJs += '<script>';
			loggingJs += 'if(typeof(console) === "undefined") console = {log: function(){}};';
			loggingJs += 'function log(str){console.log(str);}';
			loggingJs += '</script>';
			
			
			return {
				header: header,
				javascript: middle + loggingJs + jsDetectorCookieJs,
				footer:footer
			};
		}

		
		function renderWrapping(app, expressApp, pageDef, title, wrappedContent){
	
			var parts = makeWrappingParts(app, expressApp, pageDef, title);
			
			return parts.header + parts.javascript + wrappedContent + parts.footer;
		}

		function makeTypeCollectionMethod(type){
			return function(app, externalName, def){
				_.assertLength(arguments, 3);
				
				if(type === 'js'){
					var name = typeof(def) === 'string' ? def : def[0];
					files.publishJs(app, externalName, def);

					console.log(config.port + ' ' + (wrapper.isSecure ? 'https ' : 'http ') + colourize(app.name, cyan) + ' js published ' + colourize(name, green) + ' -> ' + colourize(externalName, green));
					
				}else if(type === 'css'){
				
					var name = def;
					files.publishCss(app, externalName, name);
					
					console.log(config.port + ' ' + (wrapper.isSecure ? 'https ' : 'http ') + colourize(app.name, cyan) + ' css published ' + colourize(name, green) + ' -> ' + colourize(externalName, green));
					
				}else _.errout('unknown type: ' + type);
			};
		}
		
		wrapper.css = makeTypeCollectionMethod('css');
		wrapper.js = makeTypeCollectionMethod('js');

		var get = wrapper.get;
		var post = wrapper.post;

		var hosted = {};
		var unhosted = {};
		
		var hostedContent = {};
		var hostedZippedContent = {};

		function hostFile(url, type, content, gzippedContent){
			delete unhosted[url];
			hostedContent[url] = content;
			hostedZippedContent[url] = gzippedContent;
			if(!hosted[url]){
				hosted[url] = true;

				wrapper.get(app, url, function(req, res){

					if(unhosted[url]){
						res.send(410);
					}else{
						serveFile(req, res, type, hostedContent[url], hostedZippedContent[url]);
					}
				});
			}
		}
		function unhostFile(url){
			unhosted[url] = true;
		}

		wrapper.page = function(app, pageDef){

			if(pageDef.js === undefined) pageDef.js = [];
			if(pageDef.css === undefined) pageDef.css = [];
		
			if(_.isString(pageDef.js)) pageDef.js = [pageDef.js];
			if(_.isString(pageDef.css)) pageDef.css = [pageDef.css];
		
			var local = this;
		
			if(pageDef.url === undefined) _.errout('page definition must define a "url" parameter');

			_.assertString(pageDef.url);
			
			try{
				files.loadJs(app, pageDef.js, hostFile, unhostFile, function(){
					//TODO
				}, function(err, path){//this is the failure callback
					_.errout(err);
				});
				
				files.loadCss(app, imageryImportFunction, pageDef.css, hostFile, unhostFile, function(){
					//TODO
				}, function(err, path){//this is the failure callback
					_.errout(err);
				});
			}catch(e){
				sys.debug('error loading page: ' + pageDef.url);
				throw e;
			}			

			if(pageDef.root){
				_.errout('matterhorn no longer supports templates: ' + JSON.stringify(pageDef));
			}
					
			function handler(req, res){
		
				if(pageDef.cb){
					console.log('waiting for cb reply for ' + pageDef.url);
					pageDef.cb(req, res, function(b, jsFiles){
						if(arguments.length === 0){
							console.log('Error 500, Internal Server Error - Reference Code: ' + res.uid);
							res.send('Error 500, Internal Server Error - Reference Code: ' + res.uid, 500);
						}else{
							console.log('got cb reply');
							finish(req, res, b, jsFiles);
						}
					});
				}else{
					finish(req, res, {});
				}
				
				function finish(req, res, b, jsFiles){
				
					jsFiles = jsFiles || [];
					
					for(var i=0;i<jsFiles.length;++i){
						if(typeof(jsFiles[i]) !== 'string') _.errout('ERROR: jsFiles list contains non-string: ' + jsFiles[i]);
					}
				
					if(b === undefined){
						return;
					}
					
					b.hasJs = !!req.cookies.hasjs;
					b.urlPrefix = config.prefix || '';
				

					var content = '\n<script>\n';
					_.each(b, function(value, attr){
						content += 'var ' + attr + ' = '  + JSON.stringify(value) + ';\n';
					});
					content += '</script>\n';

					var extraJs = '';
					_.each(jsFiles, function(jsFile){
						_.assertString(jsFile);
						extraJs += '<script src="' + (jsFile.indexOf('://') === -1 ? b.urlPrefix : '') + jsFile + '"></script>\n';
					});

					var title =  b.title || pageDef.title || app.name;
					//console.log('TITLE OPTIONS: ' + b.title + ' ' + pageDef.title + ' ' + app.name);
					
					var parts = makeWrappingParts(app, local, pageDef, title, content);
		
					var html = parts.header + content + parts.javascript + extraJs + parts.footer;

					res.send(html, {'Cache-Control': 'no-cache, no-store'});
				}
			}

			var args = [app, pageDef.url].concat(pageDef.filters || []).concat(handler);
			wrapper.get.apply(undefined, args);
		}
		
		wrapper.stub = function(){}
		
		wrapper.imagery = function(app, genName, mimeType, genFunction){
			
			_.assertLength(arguments, 4);
			
			var urlPrefix = '/img/' + app.name + '/' + genName + '/';

			function genCreatorFunction(params){
				//console.log('params: ' + JSON.stringify(params));
				var buffer = genFunction.apply(undefined, params);
				
				var paramStr = params.join(' ');

				var urlPattern = urlPrefix + files.computeHash(paramStr + serverStateId);
				
				wrapper.get(app, urlPattern, function(req, res){
				
					res.send(buffer, {
						'Cache-Control': 'public max-age=2592000', 
						'Expires': 'Sat, 28 Apr 2100 10:00:00 GMT',
						'Content-Type': mimeType
						});
				});
				
				return urlPattern;
			}

			generators.imagery[genName] = genCreatorFunction;
			
			console.log(config.port + ' ' + (wrapper.isSecure ? 'https ' : 'http ') + colourize(app.name, cyan) + ' imagery ' + colourize(genName, green));
		}
		
		function javascriptRedirect(res, url){
			res.send(redirHeader + config.prefix + url + redirFooter);
		}
		
		wrapper.get = function(app, path){
	
			path = wrapper.getSilent.apply(undefined, arguments);
			console.log(config.port + ' ' + (wrapper.isSecure ? 'https ' : 'http ') + colourize(app.name, cyan) + ' get ' + colourize(path, green));
		}
		
		function makeRequestCbWrapper(path, type, cb){
			return function(req, res){
				res.javascriptRedirect = javascriptRedirect;
			
				var uid = random.uid();
				req.uid = uid;
				res.uid = uid;
				//console.log(JSON.stringify(Object.keys(req)));
				console.log('+' + type + ' ' + req.url + ' ' + path + ' ' + uid);

				var oldEnd = res.end;
				res.end = function(){
					oldEnd.apply(this, Array.prototype.slice.call(arguments));
					console.log('-' + type + ' ' + req.url + ' ' + path + ' ' + uid);
				}
			
				cb(req, res);
			}
		}
		
		wrapper.getSilent = function(app, path){
		
	
			var args = Array.prototype.slice.call(arguments,1);
			args[0] = path = config.prefix + path;
			var cb = args[args.length-1];
			args[args.length-1] = makeRequestCbWrapper(path, 'GET', cb);
			get.apply(wrapper, args);

			return args[0];
		}
	
		wrapper.post = function(app, path){

			var args = Array.prototype.slice.call(arguments,1);
			args[0] = path = config.prefix + path;

			var cb = args[args.length-1];
			args[args.length-1] = makeRequestCbWrapper(path, 'POST', cb);

			post.apply(wrapper, args);
			console.log(config.port + ' ' + (wrapper.isSecure ? 'https ' : 'http ') + colourize(app.name, cyan) + ' post ' + colourize(path, green));
		}
		
		wrapper.serveJavascriptFile = function(app, path, name){
			files.loadJsFile(app, path, name, hostFile, unhostFile, function(){
				//TODO
			}, function(){
				_.errout('cannot find file to be served as "' + name + '" at path: ' + path);
			});				
			console.log(config.port + ' ' + (wrapper.isSecure ? 'https ' : 'http ') + colourize(app.name, cyan) + 
				' serving-js-file ' + colourize(name, green));
		}
		
		wrapper.serveJavascript = function(app, name, cb){
		
			var urlPrefix = '/js/' + app.name +'/';
			var url;
			var hash;
			var gzipped;
			cb(function(jsStr){

				jsStr = InDebugEnvironment ? jsStr : uglify(jsStr);

				
				var hashStr = files.hashStr(jsStr);
				if(hashStr !== hash){

					url = urlPrefix+hashStr+'/'+name+'.js';
					hostFile(url, 'js', jsStr, gzipped);
				
					zlib.gzip(jsStr, function(err, data){
						if(err) _.errout(err);
						gzipped = data;
						console.log('zipped ' + name + ' ' + data.length + ' from ' + jsStr.length + ' chars');
					
						hash = hashStr;

						hostFile(url, 'js', jsStr, gzipped);
					});
				}
				
				return url;

			});
		}
	
		return wrapper;
	}

	var express = require('express');

	//make express secure app actually secure
	var privateKey, certificate;
	var gotHttpsStuff = false;
	try{
		privateKey = fs.readFileSync(process.cwd() + '/privatekey.pem').toString();
		certificate = fs.readFileSync(process.cwd() + '/certificate.pem').toString();
		gotHttpsStuff = true;
	}catch(e){
		console.log("WARNING: Https access disabled, since one or both of privatekey.pem and certificate.pem were not found or could not be read");
	}	
	
	var localApp = express.createServer(
		express.bodyParser()
	  , express.cookieParser());

	localApp.settings.env = envType;
	
	localApp.settings.port = config.port;

	makeExpressWrapper(localApp);

	localApp.set('host', 'http://' + hostName);
	localApp.set('securehost', 'https://' + hostName);

	if(envType === 'development'){
		localApp.post(exports, '/serverchanged', serverChangedCb);
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
		var localSecureApp = express.createServer({key: privateKey, cert: certificate},
			express.bodyParser()
		  , express.cookieParser());

		localApp.settings.securePort = config.securePort;

		localApp.configure(function(){
			localApp.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
		});
		localSecureApp.settings.env = envType;

		localSecureApp.configure(function(){
			localSecureApp.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
		});

		makeExpressWrapper(localSecureApp);



		localSecureApp.isSecure = true;
		localSecureApp.set('host', 'http://' + hostName);
		localSecureApp.set('securehost', 'https://' + hostName);

		if(envType === 'development'){
			localSecureApp.post(exports, '/serverchanged', serverChangedCb);
		}
	}


	
	function applyIf(name, localApp, app, moduleName){
		var list = app[name + '__s'];
		_.each(list, function(arguments){
			if(arguments[0].name === moduleName){
				localApp[name].apply(localApp, arguments);
			}
		});
	}
	
	function include(localApp, app, moduleName){
		_.each(methods, function(method){
			applyIf(method, localApp, app, moduleName);
		});
	}
	
	var local = {
		include: function(moduleName, originalMsgCb){
		
			//TODO include should walk the entire tree, then include the flattened list in order of first visit (to avoid duplicates)

			var all = {};		
			function msg(n){
				all[n] = true;
			}
			
			msgCb = originalMsgCb || msg;
		
			var application = getApplication(moduleName);
			if(application === undefined){
				_.errout('cannot find application to include: ' + moduleName);
			}
			var reqs = application.requirements;
			if(reqs){
				_.each(reqs, function(reqModuleName){
					sys.debug(moduleName + ' including required module: ' + reqModuleName);
					local.include(reqModuleName, msgCb);
				});
			}
			include(localApp, app, moduleName);
			if(gotHttpsStuff) include(localSecureApp, secureApp, moduleName);
			
			if(!originalMsgCb){
				console.log('loaded module ' + moduleName);
				_.each(_.keys(all), function(moduleName){
					console.log('included module ' + moduleName);
				});
			}
		},
		getServer: function(){
			return localApp;
		},
		
		getPort: function(){
			return config.port;
		},
		getSecurePort: function(){
			return config.securePort;
		}
	};

	if(gotHttpsStuff){	
		local.getSecureServer = function(){
			return localSecureApp;
		}
	}	

	function after(readyCb){	

		var cdl = _.latch(1 + (gotHttpsStuff ? 1 : 0), function(){

			console.log('\nlistening on port ' + config.port + httpsPart + '\n\n');
			if(readyCb) readyCb();
		});
		
		localApp.listen(config.port, cdl);
		var httpsPart = '';
		
		if(gotHttpsStuff){
			localSecureApp.listen(config.securePort);
			httpsPart = ' (and ' + config.securePort + '.)';
		}
		
		
		
		return function(cb){
			console.log('matterhorn app ' + config.name + ' shutting down as requested.');
			localApp.close();
			if(localSecureApp) localSecureApp.close();
			if(cb) cb();
		}
	}
	
	cb(local, after);
}

exports.prepare = function(config, cb){ prepare(config, cb);}

var redirHeader = '<html><head><script>window.location = "';
var redirFooter = '";</script></head><body><noscript>Javascript is disabled.  Please enable Javascript to use this site.</noscript></body></html>';
exports.javascriptRedirectToSecure = function(res, url){
	res.send(redirHeader + 'https://" + window.location.host + "' + url + redirFooter);
}
exports.javascriptRedirectToInsecure = function(res, url){
	res.send(redirHeader + 'http://" + window.location.host + "' + url + redirFooter);
}


