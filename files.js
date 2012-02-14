
var fs = require('fs'),
	crypto = require('crypto'),
	pathModule = require('path'),
	sys = require('sys');

var _ = require('underscorem');

var uglify = require('uglify-js');
//var gzip = require('gzip');
var stylus = require('stylus');
//var dust = require('dust');

var maintainers = {};

function loadAndMaintainFile(path, handler, failCallback){
	_.assertFunction(failCallback);
	
	var oldPath = path;
	path = pathModule.resolve(path); 
	
	if(!maintainers[path]){

		var oldContent;
		
		var listeners = [];
				
		function readFile(){
			fs.readFile(path, 'utf8', function(err, str){
				if(err){
					if(failCallback) failCallback(err, path);
					else _.errout(err + ' relative version (' + oldPath + ')');
				}
				
				handler(oldContent, str, function(){
					var args = arguments;
					_.each(listeners, function(listener){
						listener.apply(undefined, args);
					});
				});
				oldContent = str;
			});
		}

		fs.watchFile(path, function (curr, prev) {
			console.log('updating file: ' + path);
			readFile();
		});
	
		maintainers[path] = {
			listen: function(listener){
				if(listeners.indexOf(listener) !== -1){
					//_.errout('duplicate listener');
					console.log('WARNING: tried to add duplicate listener');
				}else{
					listeners.push(listener);
				}
			}
		};

		readFile();
	}
		
	return maintainers[path];
}


//---------------------------------------

var hashes = {
	js: {},
	css: {},
	template: {}
};

var content = {
	js: {}, 
	css: {},
	template: {}
}
var gzipped = {
	js: {}, 
	css: {}
}


//files referred to by external projects (projects with a different js directory) must refer to published files
var published = {
	js: {},
	css: {}
};

var dependencies = {
	js: {},
	css: {}
};

var prefixedCss = {
	normal: {},
	gzipped: {}
};

//var templates = {};

var modules = {};
/*
exports.loadTemplate = function(module, templateName, cb){
	
	//sys.debug('loading template: ' + templateName);
	
	var key = module.name+':'+templateName;
	var templatePath = module.dir + '/template/' + templateName + '.dust';
	loadAndMaintainFile(templatePath, function(oldContent, newContent){
		
		//templates[key] = newContent;
		var compiled = dust.compile(newContent, templateName);
		dust.loadSource(compiled);
		//templates[key] = compiled;
	});
}

function dustTransform(templateContent, templateName, currentApp, cb){
	var templateDustName = templateName.substr(0, templateName.lastIndexOf('.'));
	var compiled = dust.compile(templateContent, templateDustName);
	dust.loadSource(compiled);
	cb(compiled);
}

exports.applyTemplate = function(module, templateName, b, cb){
	dust.render(templateName, b, function(err, content){
		if(err) throw err;
		
		cb(content);
	});				
}

function makeTemplateUpdateHandler(module, templateName){

	var hash;
	var key = module.name+':'+templateName;
	
	return function(oldContent, newContent, cb){

		var newHash = computeHash(newContent);
		
		//sys.debug('got content for ' + key);
		
		storeJs(key, newContent, function(content, gzippedContent){

			cb(module, jsName, content, gzippedContent, hash, newHash);
		});
	}
}
*/
function removeHashPadding(hash){
	return hash.replace(/=/gi,'').replace(/\+/gi,'-').replace(/\//gi,'_');
}
function computeHash(str){
	var hash = crypto.createHash('md5');
	hash.update(str);
	var h = hash.digest('base64');
	h = removeHashPadding(h);
	return h;
}

exports.computeHash = computeHash;

function url(moduleName, type, name, hash){
	_.assertLength(arguments, 4);
	_.assertString(moduleName);
	_.assertString(name);
	_.assertString(hash);
	return '/' + type + '/' + moduleName + '/' + hash + '/' + name + '.' + type;
}

var zlib = require('zlib');

function storeJs(key, jsContent, cb){
	
	var c = InDebugEnvironment ? jsContent : uglify(jsContent);
	content.js[key] = c;
	
	/*
	gzip(c, function(err, data){
		if(err) _.errout(err);
		gzipped.js[key] = data;
		
		cb(c, data);
	});*/
	zlib.gzip(c, function(err, data){
		if(err) _.errout(err);
		gzipped.js[key] = data;
		
		cb(c, data);
	});
	
}

function stylusTransform(content, name, imageryImportFunction, cb){
	stylus(content).set('filename', name).define('imagery', imageryImportFunction).render(function(err, css){

		if (err) throw err;

		cb(css);
	});
}

function storeCss(key, name, cssContent, cb){
	
//	stylusTransform(cssContent, name, function(c){
		var c = cssContent;
		content.css[key] = c;
	
		zlib.gzip(c, function(err, data){
			if(err) _.errout(err);
			gzipped.css[key] = data;
		
			cb(c, data);
		});
	//});
}

function makeRehostHandler(hostFile, unhostFile, type){

	return function(module, name, content, gzippedContent, oldHash, newHash){

		if(oldHash){
			unhostFile(url(module.name, type, name, oldHash));
		}
	
		hostFile(url(module.name, type, name, newHash), type, content, gzippedContent);
	}
}

function cleanStylusContent(content){
	var lines = content.split('\n');
	for(var i=0;i<lines.length;++i){
		var line = lines[i];
		if(line.indexOf(CssImportsPrefix) === 0){
			lines.splice(i, 1);
			--i;
		}
	}
	return lines.join('\n');
}

function makeCssRehostHandler(imageryFunction, hostFile, unhostFile, type){

	return function(module, name, content, gzippedContent, oldHash, newHash){

		content = cleanStylusContent(content);

		//imageryFunction.bind(undefined, module.name, name)
		stylusTransform(content, name, function(a, b, c, d, e, f, g, h, i, j, k, l, m, n){
			console.log('got imagery function call');
			//console.log(JSON.stringify(res));
			var args = Array.prototype.slice.call(arguments);
			args = [content, name].concat(args);
			return imageryFunction.apply(undefined, args);
		}, function(css){

			zlib.gzip(css, function(err, gzippedContent){
				if(err) _.errout(err);
				
				if(oldHash){
					unhostFile(url(module.name, type, name, oldHash));
				}
	
				hostFile(url(module.name, type, name, newHash), type, css, gzippedContent);
			});
		});
	}
}

function makeJsUpdateHandler(module, jsName){

	var hash;
	var key = module.name+':'+jsName;
	
	return function(oldContent, newContent, cb){

		var newHash = computeHash(newContent);
		
		//sys.debug('got content for ' + key);
		computeJsDependencies(module, jsName, newContent, cb);
		
		storeJs(key, newContent, function(content, gzippedContent){

			cb(module, jsName, content, gzippedContent, hash, newHash);

			console.log('updated js hash (' + key + ') ' + hash + ' -> ' + newHash);
			hashes.js[key] = hash = newHash;
		});
	}
}
function makeCssUpdateHandler(module, cssName){

	var hash;
	var key = module.name+':'+cssName;
	
	return function(oldContent, newContent, cb){

		var newHash = computeHash(newContent);
		
		//sys.debug('got content for ' + key);
		computeCssDependencies(module, cssName, newContent, cb);
		
		storeCss(key, cssName, newContent, function(content, gzippedContent){

			cb(module, cssName, content, gzippedContent, hash, newHash);

			hashes.css[key] = hash = newHash;
		});
	}
}

var RequiresPrefix = '//#requires';
	
function computeRequirements(currentModule, jsName, jsContent, includeCb){
	_.assertLength(arguments, 4);
	_.assertString(jsName);
	_.assertString(jsContent);
	_.assertFunction(includeCb);

	//sys.debug('computing requirements of ' + jsName);

	var key = currentModule.name+':'+jsName;
	var dep = dependencies.js[key] = dependencies.js[key] || {};
	
	var lines = jsContent.split('\n');
	for(var i=0;i<lines.length;++i){
		var line = lines[i];
		if(line.indexOf(RequiresPrefix) === 0){

			//sys.debug('found requirements line ' + line);

			var requirements = line.substr(RequiresPrefix.length).split(' ');
			_.each(requirements, function(req){
			
				if(req.length === 0) return;
			
				var module;
				if(req.indexOf(':') !== -1){
					module = req.substr(0, req.indexOf(':'));
					req = req.substr(req.indexOf(':')+1);
				}	

				var reqs = req.split(',');
				
				//sys.debug('req: ' + req);
				//sys.debug('processing reqs: ' + JSON.stringify(reqs));
				_.each(reqs, function(req){
				
					var m = module || currentModule.name;
					
					includeCb(dep, req, m);
				});
			});
		}
	}
}

var CssImportsPrefix = "@import";

function computeCssRequirements(currentModule, cssName, cssContent, includeCb){
	_.assertLength(arguments, 4);
	_.assertString(cssName);
	_.assertString(cssContent);
	_.assertFunction(includeCb);

	//sys.debug('computing requirements of ' + cssName);

	var key = currentModule.name+':'+cssName;
	var dep = dependencies.css[key] = dependencies.css[key] || {};
	
	var lines = cssContent.split('\n');
	for(var i=0;i<lines.length;++i){
		var line = lines[i];
		if(line.indexOf(CssImportsPrefix) === 0){

			//sys.debug('found requirements line ' + line);

			var requirements = line.substr(CssImportsPrefix.length).split(' ');
			_.each(requirements, function(req){
			
				if(req.length === 0) return;
			
				var module;
				if(req.indexOf(':') !== -1){
					module = req.substr(0, req.indexOf(':'));
					req = req.substr(req.indexOf(':')+1);
				}	

				var reqs = req.split(',');
				
				//sys.debug('req: ' + req);
				//sys.debug('processing reqs: ' + JSON.stringify(reqs));
				_.each(reqs, function(req){
				
					if(req.length === 0) return;
				
					var m = module || currentModule.name;
					
					includeCb(dep, req, m);
				});
			});
		}
	}
}

function computeCssDependencies(module, cssName, content, rehoster){


	computeCssRequirements(module, cssName, content, function(dep, reqCssName, moduleName){
		var childCssName = reqCssName;
		var m = module;
		
		//sys.debug('found dep: ' + module.name + ':' + cssName + '->' + moduleName + ':' + reqCssName);
		if(moduleName !== module.name){

			if(published.css[moduleName+':'+reqCssName] === undefined){
				//sys.debug(sys.inspect(published));
				_.errout(module.name + ':' + cssName + '.css has remote reference to unpublished (maybe non-existent) css file: ' + moduleName + ':' + reqCssName);
			}
			childCssName = published.css[moduleName+':'+reqCssName];
			//sys.debug('resolved external name ' + reqCssName + '->' + childCssName);
			
			if(!moduleName) _.errout('programmer error');


			m = modules[moduleName];//require(moduleName);
			_.assertObject(m);
		}

		dep[childCssName] = moduleName;

		function failureCb(err, path){
			_.errout('cannot find css file included by ' + cssName + ': ' + path + '\n' + err);
		}
		
		loadCssLocal(m, [childCssName], rehoster, failureCb);
	});
}

var alreadyLoaded = {};

function computeJsDependencies(module, jsName, content, rehoster){

	computeRequirements(module, jsName, content, function(dep, reqJsName, moduleName){
		var childJsName = reqJsName;
		var m = module;
		
		//sys.debug('found dep: ' + module.name + ':' + jsName + '->' + moduleName + ':' + reqJsName);
		var key = moduleName+':'+reqJsName;
		if(moduleName !== module.name || published.js[key] !== undefined){
			//console.log(published.js);
			//console.log(key);
			if(published.js[key] === undefined){
				sys.debug(sys.inspect(published));
				_.errout(module.name + ':' + jsName + '.js has remote reference to nonexistent or unpublished javascript file: ' + moduleName + ':' + reqJsName);
			}
			childJsName = published.js[key];

			if(!moduleName) _.errout('programmer error');


			m = modules[moduleName];//require(moduleName);
			if(m === undefined) _.errout('cannot find module included by file ' + jsName + ': ' + moduleName);
			_.assertObject(m);
			
			//sys.debug('resolved external name ' + reqJsName + '->' + childJsName);
		
		}

		if(typeof(childJsName) !== 'string'){
			dep[childJsName[0]] = moduleName;
		}else{
			dep[childJsName] = moduleName;
		}

		if(alreadyLoaded[key]) return;	

		function failureCb(err, path){
			_.errout('cannot find js file included by ' + jsName + ': ' + path + '\n' + err);
		}
		
		loadJsLocal(m, [childJsName], rehoster, failureCb);
	});
}

function loadJsLocal(module, jsList, rehoster, failCallback){
	//console.log('loading js list: ' + JSON.stringify(jsList));
	_.each(jsList, function(jsName){
		
		//if(jsName === 'socket.io') _.errout('wtf:'+module.name+':'+jsName);
		
		if(alreadyLoaded[jsName]) return;
		
		var maintainer;
		if(typeof(jsName) !== 'string'){
			var h = makeJsUpdateHandler(module, jsName[0]);
			
			//sys.debug('got special js: ' + JSON.stringify(jsName));
			if(jsName.length > 2){
				var transformFunction = jsName[2];
				var oldH = h;
				h = function(oldContent, newContent, cb){
					oldH(transformFunction(oldContent), transformFunction(newContent), cb);
				}
			}
			
			maintainer = loadAndMaintainFile(jsName[1], h, failCallback); 
		}else{

			if(jsName.length < 2) _.errout('invalid js name: ' + jsName);
			var h = makeJsUpdateHandler(module, jsName);

			//console.log('loading file: ' + module.dir+'/js/'+jsName+'.js');
			maintainer = loadAndMaintainFile(module.dir+'/js/'+jsName+'.js', h, failCallback); 
		}		
		maintainer.listen(rehoster);
	});
}

function loadJsSpecific(module, path, name, rehoster, failCallback){

	var h = makeJsUpdateHandler(module, name);
	var maintainer = loadAndMaintainFile(path, h, failCallback); 
	maintainer.listen(rehoster);
}

exports.loadJsFile = function(module, path, name, hostFile, unhostFile, cb, failCallback){
	_.assert(arguments.length >= 6);
	_.assert(arguments.length <= 7);
	
	var rehoster = makeRehostHandler(hostFile, unhostFile, 'js');
	
	loadJsSpecific(module, path, name, rehoster, failCallback);
	
	modules[module.name] = module;
	published.js[module.name+':'+name] = name;
	
	alreadyLoaded[module.name+':'+name] = true;
}

exports.loadJs = function(module, jsList, hostFile, unhostFile, cb, failCallback){
	_.assert(arguments.length >= 5);
	_.assert(arguments.length <= 6);

	var rehoster = makeRehostHandler(hostFile, unhostFile, 'js');
	
	loadJsLocal(module, jsList, rehoster, failCallback);
}

function getDependencies(module, name, type){

	var res = [];

	var key = module + ':' + name;
	var deps = dependencies[type][key];
	
	//sys.debug('dependencies: ' + key);
	//sys.debug(sys.inspect(deps));
	
	_.each(deps, function(m, depName){

		var h = hashes[type][m+':'+depName];
		if(h === undefined) _.errout('file was never loaded: ' + m + ': ' + depName + '.' + type);
		var u = url(m, type, depName, h);

		if(res.indexOf(u) !== -1) return;

		addIfMissing(res, getDependencies(m, depName, type));

		//sys.debug('(' + m+':'+depName + ')');

		res.push(u);
	});
	
	return res;
}

function addIfMissing(list, newValues){
	_.each(newValues, function(v){
		if(list.indexOf(v) === -1) list.push(v);
	});
}

//callsback with each url for the javascript file and any included files
//for use by 'page'
exports.includeJs = function(module, jsList, eachCb){
	_.assertLength(arguments, 3);
	
	var deps = [];
	_.each(jsList, function(jsName){

		addIfMissing(deps, getDependencies(module.name, jsName, 'js'));

		var h = hashes.js[module.name+':'+jsName];
		sys.debug('key: ' + module.name+':'+jsName);
		_.assertString(h);
		
		var u = url(module.name, 'js', jsName, h);
		
		addIfMissing(deps, [u]);
	});
	
	_.each(deps, function(dep){
		eachCb(dep);
	});
}

exports.publishJs = function(module, externalName, name){
	modules[module.name] = module;
	published.js[module.name+':'+externalName] = name;
	//sys.debug('published ' + module.name+':'+ name + ' -> ' + externalName);
}
exports.publishCss = function(module, externalName, name){
	modules[module.name] = module;
	published.css[module.name+':'+externalName] = name;
	//console.log('published ' + module.name+':'+ name + ' -> ' + externalName);
}

//we intercept the @import 'blah' lines ourselves
exports.loadCss = function(module, imageryFunction, cssList, hostFile, unhostFile, cb, failureCb){
	_.assert(arguments.length >= 6);
	_.assert(arguments.length <= 7);
	
	var rehoster = makeCssRehostHandler(imageryFunction, hostFile, unhostFile, 'css');
	
	loadCssLocal(module, cssList, rehoster, failureCb);

}

exports.hashStr = function(str){
	return computeHash(str);
}


function loadCssLocal(module, cssList, rehoster, failureCb){
	
	_.each(cssList, function(name){

		if(name.length < 2) _.errout('invalid name: ' + name);

		var maintainer = loadAndMaintainFile(module.dir+'/css/'+name+'.css', makeCssUpdateHandler(module, name), failureCb); 
		
		maintainer.listen(rehoster);
	});
}

exports.includeCss = function(module, cssList, eachCb){
	_.assertLength(arguments, 3);
	
	var deps = [];
	_.each(cssList, function(cssName){

		addIfMissing(deps, getDependencies(module.name, cssName, 'css'));

		var h = hashes.css[module.name+':'+cssName];
		//sys.debug('key: ' + module.name+':'+cssName);
		//sys.debug(sys.inspect(hashes.css));
		if(h === undefined){
			_.errout('unknown css file specified by module ' + module.name + ': ' + cssName);
		}
		var u = url(module.name, 'css', cssName, h);
		
		addIfMissing(deps, [u]);
	});
	
	_.each(deps, function(dep){
		eachCb(dep);
	});
}



	

/*
var transforms = {
	css: stylusTransform,
	template: dustTransform,
	js: jsTransform
};*/

