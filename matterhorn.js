
var sys = require('sys'),
	fs = require('fs'),
	crypto = require('crypto');

var _ = require('underscorem');

var dust = require('dust');
var stylus = require('stylus');

var uglify = require('uglify-js');
var gzip = require('gzip');

function removeHashPadding(hash){
	return hash.replace(/=/gi,'').replace(/\+/gi,'-').replace(/\//gi,'_');
}
function hash(str){
	var hash = crypto.createHash('md5');
	hash.update(str);
	var h = hash.digest('base64');
	h = removeHashPadding(h);
	return h;
}
function getMimeType(type){
	if(type === 'js') return 'text/javascript';
	else if(type === 'css') return 'text/css';
	else if(type === 'template') return 'text/javascript';
	else{
		_.errout('mime type unknown for type: ' + type);
	}
}


function extendContext(a, withB){
	if(withB.js){
		for(var i=0;i<withB.js.length;++i){
			var j = withB.js[i];
			if(a.js.indexOf(j) === -1) a.js.push(j);
		}
	}
	if(withB.css){
		for(var i=0;i<withB.css.length;++i){
			var j = withB.css[i];
			if(a.css.indexOf(j) === -1) a.css.push(j);
		}
	}
	if(withB.models){
		for(var i=0;i<withB.models.length;++i){
			var j = withB.models[i];
			if(a.models.indexOf(j) === -1) a.models.push(j);
		}
	}
}
function doInclude(a,withB){
	if(withB.include){		
		for(var i=0;i<withB.include.length;++i){
			var fragment = withB.include[i];
			extendContext(a, fragment);	
			if(fragment.include){
				doInclude(a,fragment);
			}			
		}
	}
}

var apps = {};
var claimed = {};
var secureApps = {};
var claimedSecure = {};
getApplication = function(moduleName){
	return apps[moduleName];
}
var methods = ['get', 'post', 'js', 'css', 'template', 'page'];

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
		_.assertString(app.name);
		var c = claimed;
		var a = apps;
		if(this.secure){
			a = secureApps;
			c = claimedSecure;
		}
		if(a[app.name] !== undefined && a[app.name] !== app){
			//console.log(c[app.name]);
			//_.errout('(' + (this.secure ? 'secure' : 'normal') + ') naming conflict, name already taken: ' + app.name);
		}else{
			a[app.name] = app;
			c[app.name] = new Error().stack;
		}
		if(this[key] === undefined) _.errout('missing list(' + key + ')');
		this[key].push(arguments);
	}
});

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

	var hashes = {
		js: {},
		css: {},
		template: {}
	};

	var content = {
		js: {}, 
		css: {},
		template: {}
	};
	
	var gzipped = {
		js: {}, 
		css: {}
	};
	var generators = {
		imagery: {}
	};
	
	var serverStateId;
	
	function resetServerStateId(){
		serverStateId = ''+Math.floor(Math.random()*1000*1000);
		console.log('server state uid: ' + serverStateId);
	}
	resetServerStateId();
	
	function dustTransform(templateContent, templateName, cb){
		var templateDustName = templateName.substr(0, templateName.lastIndexOf('.'));
		var compiled = dust.compile(templateContent, templateDustName);
		dust.loadSource(compiled);
		cb(compiled);
	}
	
	function jsTransform(jsContent, jsName, cb){
		
		if(envType === 'production'){
		
			var minStr = uglify(jsContent);
			cb(minStr);
		}else{
			cb(jsContent);
		}
	}
	
	function imageryImportFunction(a, b, c, d, e, f, g, h, i){
	
		var args = Array.prototype.slice.call(arguments);
	
		var argValues = [];
		
		//sys.debug(sys.inspect(args));
		
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
	
		sys.debug('imagery name(' + name + ')');

		//calling the imagery function sets up the get endpoint with the generator defined by params,
		//and returns the url path of the endpoint.
		
		var genFunction = generators.imagery[name];
		
		if(genFunction === undefined){
			_.errout('no imagery generator defined called ' + name);
		}
		
		console.log('params: ' + JSON.stringify(params));
		
		var url = genFunction(params);
		
		return new stylus.nodes.String(url);
	}
	
	function stylusTransform(content, name, cb){
		stylus(content).set('filename', name).define('imagery', imageryImportFunction).render(function(err, css){

			if (err) throw err;

			cb(css);
		});
	}
	
	var transforms = {
		css: stylusTransform,
		template: dustTransform,
		js: jsTransform
	};

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

	function findFile(type, fileIdent, app, cb){

		if(app.dir === undefined){
			_.errout('no directory defined for app: ' + sys.inspect(app));
		}

		var typeDir = app.dir + '/' + type;

		var fullPath = typeDir + '/' + fileIdent;
		
		fs.readFile(fullPath, 'utf8', processFile);
		
		function processFile(err, str){
			if(err){
				if(err.code === 'ENOENT'){
					_.errout('cannot find ' + type + ' file or collection of ' + type + ' files included by app ' + app.name + ': ' + fileIdent);
				}else{
					_.errout(err);
				}
			}

			var transform = transforms[type];

			if(transform){
				//console.log('transforming: ' + fileIdent);
				str = transform(str, fileIdent, function(str){
					if(str === undefined){
						_.errout('transform of ' + fileIdent + ' resulted in undefined value');
					}
					//console.log('transform called back: ' + fileIdent);
					finishRead(str);
				});
			}else{
				finishRead(str);
			}
		}
		
		watchFile();
		
		function watchFile(){
			fs.watchFile(fullPath, function (curr, prev) {
			
				console.log('updating file: ' + fullPath);
			
				fs.readFile(fullPath, 'utf8', function(err, str){
					processFile(err, str);				
					resetServerStateId();
				});

			});
		}
		function finishRead(str){
			content[type][app.name+':'+fileIdent] = new Buffer(str);
			
			if(gzipped[type] !== undefined){

				gzip(str, function(err, data){
					gzipped[type][app.name+':'+fileIdent] = data;
				});
			}

			hashes[type][app.name +':'+fileIdent] = hash(str);

			if(cb) cb(fileIdent);
		}
	}


	function makeExpressWrapper(wrapper){

		var entries = {css: {}, js: {}},
			attached = {};
		
		function findFiles(type, ident, app, cb, doNotUseContext){

			var context = entries[type];
			if(context[ident]){

				if(doNotUseContext){	
					cb();
					return;
				}
			
				cb(ident, true);
				return;
			}

			findFile(type, ident+'.'+type, app, function(name){
		
				cb(name);
			});
		}
		
		function loadFiles(list, type, app, attachFile){
			_.each(list, function(c){
				findFiles(type, c, app, function(fileName, fromCollection){
					if(arguments.length === 0) return;
				
					if(!fromCollection){
						attachFile(app,type, fileName);
						//console.log('found file: ' + type + ' ' + c);
						entries[type][c] = [{name: fileName, appName: app.name}];
					}
				}, true);
			});
		}
		
		function loadCollection(list, type, app, attachFile, cb){
	
			var result = [];
	
			var cdl = _.latch(list.length, function(){
				cb();
			});
		
			_.each(list, function(c, index){
				findFiles(type, c, app, function(fileName, fromCollection){

					if(!fromCollection){
						var v = {name: fileName, appName: app.name};
						attachFile(app,type, fileName);
						entries[type][c] = [v];
						result[index] = v;
					}else{
						result[index] = fileName;
					}
					cdl();
				});
			});
			return result;
		}
		
		function attachFile(app, type, name, pathType){
			_.assertString(name);
			
			var path = '/' + (pathType !== undefined ? pathType : type) + '/' + app.name + '/:hash/' + name;
			if(!attached[path]){
				attached[path] = true;
				//console.log('attached path: ' + path);
				wrapper.get(app, path, function(req, res){
					
					console.log('got file request: ' + path);
					
					//this bit here is to work around a Chrome bug
					var chromeException = 
						(req.header('User-Agent') && req.header('User-Agent').indexOf('Chrome')) !== -1 && 
						req.header('Cache-Control') === 'max-age=0';
					
					if((req.header('Cache-Control') !== undefined && !chromeException) || req.header('Expires') !== undefined){
						//console.log('headers: ' + JSON.stringify(req.headers));
						res.header('Content-Type', '');
						res.send(304);
					}else{

						var headers = {
							'Cache-Control': 'public max-age=2592000', 
							'Expires': 'Sat, 28 Apr 2100 10:00:00 GMT',
							'Content-Type': getMimeType(type)};

						var fileContents;

						var key = app.name + ':' + name;
						
						var compHeader = req.header('Accept-Encoding');
						if(compHeader && compHeader.indexOf('gzip') !== -1 && gzipped[type][key] !== undefined){
							fileContents = gzipped[type][key];
							headers['Content-Encoding'] = 'gzip';
						}else{
							fileContents = content[type][key];
						}
						
						if(fileContents === undefined){
							_.errout('file contents missing for ' + path);
						}
						//console.log('looking for file: ' + app.name + ':' + name);
						
						
						if(chromeException){
							headers['Warning'] = 'Working around Chrome 304 bug';
						}
						res.send(fileContents, headers);
					}
				});
			}
		}

		function makeWrappingParts(app, expressApp, pageDef, title){
			var header = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" ' + 
				'"http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">\n'+
				'<html xmlns="http://www.w3.org/1999/xhtml">\n'+
				'<head><meta http-equiv="Content-type" content="text/html;charset=UTF-8"/>\n<title>' + title + '</title>';

			_.each(pageDef.css, function(ident){
				var c = entries.css[ident];
				if(c === undefined) _.errout('cannot find css ' + ident);
				for(var i=0;i<c.length;++i){
					var hash = hashes.css[c[i].appName +':'+c[i].name];
					var url = config.prefix + '/css/' + c[i].appName + '/' + hash + '/' + c[i].name;
					header += '<link type="text/css" rel="stylesheet" href="' + url + '"></link>';
				}
			});
	
			header += '</head><body>';
		
			var middle = '';
		
			var jsFiles = [];
			function loadJs(ident){
				var c = entries.js[ident];
				if(c === undefined) _.errout('cannot find js ' + ident);
				for(var i=0;i<c.length;++i){
					if(typeof(c[i]) === 'string'){
						loadJs(c[i]);
					}else{
						if(c[i] === undefined){
							_.errout('cannot find js ' + ident);
						}
						var hash = hashes.js[c[i].appName +':'+c[i].name];
						var url = config.prefix + '/js/' + c[i].appName + '/' + hash + '/' + c[i].name;

						if(jsFiles.indexOf(url) === -1) jsFiles.push(url);
					}
				}
			}
			_.each(pageDef.js, loadJs);
			
			_.each(jsFiles, function(jsFile){
				middle += '<script type="text/javascript" src="' + jsFile + '"></script>';
			});
		
			var modelContent = '';
			if(pageDef.models){

				_.each(pageDef.models, function(modelName){
					var appName = app.name;
					if(appName === undefined){
						_.errout('model template not found: ' + modelName);
					}
				
					var hash = hashes.template[appName +':'+modelName];
					var url = config.prefix + '/model/' + appName + '/' + hash + '/' + modelName + '.dust';
					middle += '<script type="text/javascript" src="' + url + '"></script>';
				});
			}
		
			var footer = '</body></html>';
			
			var jsDetectorCookieJs = '<script type="text/javascript">';
			jsDetectorCookieJs += "if(document.cookie.indexOf('hasjs') === -1){document.cookie = 'hasjs=true; expires=Fri, 3 Aug 2100 20:47:11 UTC; path=/'}";
			jsDetectorCookieJs += '</script>';
			
			var refreshDetectorJs = '';			
			if(expressApp.settings.env === 'development' && !app.disableRefreshDetector){
				refreshDetectorJs += '<script type="text/javascript">';
				refreshDetectorJs += "var serverChangeRefreshDelay = 500;";				
				refreshDetectorJs += "(function(){";
				refreshDetectorJs += "function checkChanged(){";
				refreshDetectorJs += 	"$.ajax({";
				refreshDetectorJs += 		"type: 'POST',";
				refreshDetectorJs += 		"url: '" + config.prefix + "/serverchanged',";
				refreshDetectorJs += 		"data: {id: " + serverStateId + "},";				
				refreshDetectorJs += 		"success: function(reply){";
				refreshDetectorJs += 			"if(reply === ''){";
				refreshDetectorJs += 				"setTimeout(checkChanged, serverChangeRefreshDelay);";
				refreshDetectorJs += 			"}else{";
				refreshDetectorJs += 				"window.location.reload();";
				refreshDetectorJs += 			"}";
				refreshDetectorJs += 		"},";
				refreshDetectorJs += 		"error: function(err){";
				refreshDetectorJs += 			"console.log(err);";
				refreshDetectorJs += 			"setTimeout(checkChanged, serverChangeRefreshDelay);";
				refreshDetectorJs += 		"}";
				refreshDetectorJs += 	"});";
				refreshDetectorJs += "}";
				refreshDetectorJs += "setTimeout(checkChanged, serverChangeRefreshDelay);";
				refreshDetectorJs += "})();";
				refreshDetectorJs += '</script>';
			}
			return {
				header: header,
				javascript: middle + modelContent + jsDetectorCookieJs + refreshDetectorJs,
				footer:footer
			};
		}

		
		function renderWrapping(app, expressApp, pageDef, title, wrappedContent){
	
			var parts = makeWrappingParts(app, expressApp, pageDef, title);
			
			return parts.header + parts.javascript + wrappedContent + parts.footer;
			
			//return header + middle + modelContent + jsDetectorCookieJs + refreshDetectorJs + wrappedContent + footer;
		}
		
		wrapper.template = function(app, templateName){
	
			if(arguments.length !== 2) _.errout('should be 2 arguments, but there are ' + arguments.length);
	
			var fullPath = app.dir + '/template/' + templateName + '.dust';
			
			findFile('template', templateName+'.dust', app, function(){
				attachFile(app, 'template', templateName+'.dust', 'model');				
			});
		}

		function makeTypeCollectionMethod(type){
			return function(app, collectionName, list){
				if(arguments.length !== 3) _.errout('should be 3 arguments, but there are ' + arguments.length);

				if(entries[type][collectionName] !== undefined){
					return;
				}

				var result = loadCollection(list, type, app, attachFile, function(){
					console.log(config.port + ' ' + (wrapper.isSecure ? 'https' : 'http') + ' ' + type + ' collection ' + collectionName + ' <- ' + JSON.stringify(list));
				});	
				entries[type][collectionName] = result;
			};
		}
		
		wrapper.css = makeTypeCollectionMethod('css');
		wrapper.js = makeTypeCollectionMethod('js');

		var get = wrapper.get;
		var post = wrapper.post;

		wrapper.page = function(app, pageDef){
		
			var local = this;
		
			if(pageDef.url === undefined) _.errout('page definition must define a "url" parameter');
			//if(pageDef.root === undefined) _.errout('page definition must define a "root" parameter');

			_.assertString(pageDef.url);
			//_.assertString(pageDef.root);

			var extendedPageDef = {js: [], css: [], models: []};

			doInclude(extendedPageDef, pageDef);
			extendContext(extendedPageDef, pageDef);
		
			loadFiles(extendedPageDef.css, 'css', app, attachFile);
			loadFiles(extendedPageDef.js, 'js', app, attachFile);
			
			function handler(req, res){
		
				if(pageDef.cb){
					console.log('waiting for cb reply for ' + pageDef.url);
					pageDef.cb(req, res, function(b){
						console.log('got cb reply');
						finish(req, res, b);
					});
				}else{
					finish(req, res, {});
				}
				
				function finish(req, res, b){
				
					if(b === undefined){
						return;
					}
					
					b.hasJs = !!req.cookies.hasjs;
					b.urlPrefix = config.prefix || '';
				
					if(pageDef.root){
				
						dust.render(pageDef.root, b, function(err, content){
							if(err) throw err;
					
							var html = renderWrapping(app, local, extendedPageDef, b.title || app.name, content);
							console.log('sending');
							res.send(html, {'Cache-Control': 'no-cache, no-store'});
						});
					}else{
						var content = '\n<script>\n';
						_.each(b, function(value, attr){
							content += 'var ' + attr + ' = '  + JSON.stringify(value) + ';\n';
						});
						content += '</script>\n';

						var parts = makeWrappingParts(app, local, extendedPageDef, b.title || app.name, content);
			
						var html = parts.header + content + parts.javascript + parts.footer;

						console.log('sending');
						res.send(html, {'Cache-Control': 'no-cache, no-store'});
					}
				}
			}

			var args = [app, pageDef.url].concat(pageDef.filters || []).concat(handler);
			wrapper.get.apply(undefined, args);
		}
		
		wrapper.imagery = function(app, genName, mimeType, genFunction){
			
			_.assertLength(arguments, 4);
			
			var urlPrefix = '/img/' + app.name + '/' + genName + '/';

			function genCreatorFunction(params){
				
				var buffer = genFunction.apply(undefined, params);
				
				var paramStr = params.join(' ');
				console.log('param str: ' + paramStr);
				var urlPattern = urlPrefix + hash(paramStr + serverStateId);
				
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
	
			var args = Array.prototype.slice.call(arguments,1);
			args[0] = path = config.prefix + path;
			var cb = args[args.length-1];
			args[args.length-1] = function(req, res){
				res.javascriptRedirect = javascriptRedirect;
				cb(req, res);
			}
			get.apply(wrapper, args);
			console.log(config.port + ' ' + (wrapper.isSecure ? 'https ' : 'http ') + colourize(app.name, cyan) + ' get ' + colourize(path, green));
		}
	
		wrapper.post = function(app, path){

			var args = Array.prototype.slice.call(arguments,1);
			args[0] = path = config.prefix + path;
			post.apply(wrapper, args);
			console.log(config.port + ' ' + (wrapper.isSecure ? 'https ' : 'http ') + colourize(app.name, cyan) + ' post ' + colourize(path, green));
		}
	
		return wrapper;
	}

	var express = require('express');

	//make express secure app actually secure
	var privateKey = fs.readFileSync(process.cwd() + '/privatekey.pem').toString();
	var certificate = fs.readFileSync(process.cwd() + '/certificate.pem').toString();
	
	var localApp = express.createServer(
		express.bodyParser()
	  , express.cookieParser());

	var localSecureApp = express.createServer({key: privateKey, cert: certificate},
		express.bodyParser()
	  , express.cookieParser());


	localApp.settings.env = envType;
	localSecureApp.settings.env = envType;
	
	localApp.settings.port = config.port;
	localApp.settings.securePort = config.securePort;

	localApp.configure(function(){
		localApp.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
	});
	localSecureApp.configure(function(){
		localSecureApp.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
	});

	makeExpressWrapper(localApp);
	makeExpressWrapper(localSecureApp);



	localSecureApp.isSecure = true;

	localApp.set('host', 'http://' + hostName);
	localSecureApp.set('host', 'http://' + hostName);
	localApp.set('securehost', 'https://' + hostName);
	localSecureApp.set('securehost', 'https://' + hostName);

	function serverChangedCb(req, res){

		var expectedId = req.body.id;
		if(expectedId !== serverStateId){
			res.send('r');
		}else{
			setTimeout(function(){
				res.send('');				
			}, 30*1000);
		}
	}
	if(envType === 'development'){
		localApp.post(exports, '/serverchanged', serverChangedCb);
	}
	if(envType === 'development'){
		localSecureApp.post(exports, '/serverchanged', serverChangedCb);
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
		applyIf('get', localApp, app, moduleName);
		applyIf('post', localApp, app, moduleName);
		applyIf('js', localApp, app, moduleName);
		applyIf('css', localApp, app, moduleName);
		applyIf('template', localApp, app, moduleName);
		applyIf('page', localApp, app, moduleName);
	}
	
	var local = {
		include: function(moduleName){
			var application = getApplication(moduleName);
			if(application === undefined){
				_.errout('cannot find application to include: ' + moduleName);
			}
			var reqs = application.requirements;
			if(reqs){
				_.each(reqs, function(reqModuleName){
					sys.debug(moduleName + ' including required module: ' + reqModuleName);
					local.include(reqModuleName);
				});
			}else{
				console.log('module has no requirements: ' + moduleName);
			}
			console.log('including ' + moduleName);
			include(localApp, app, moduleName);
			include(localSecureApp, secureApp, moduleName);
		},
		getServer: function(){
			return localApp;
		},
		getSecureServer: function(){
			return localSecureApp;
		},
		getPort: function(){
			return config.port;
		},
		getSecurePort: function(){
			return config.securePort;
		}
	};
	function after(){
	

		localApp.listen(config.port);
		localSecureApp.listen(config.securePort);

		console.log('\nlistening on port ' + config.port + ' (and ' + config.securePort + '.)\n\n');
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


