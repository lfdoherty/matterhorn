
var sys = require('sys'),
	fs = require('fs'),
	crypto = require('crypto');

var _ = require('underscorem');

var dust = require('dust');

if(process.argv.length !== 4){
	console.log('Matterhorn should be run as follows:\nnode matterhorn <application> <host>');
	process.exit(0);
}

var appFile = process.argv[2];
var hostName = process.argv[3];


var globalContext = {
	models: {},
	views: {},
	templates: {},
	helpers: {},
	css: {},
	js: {},
	helpers: {}
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


console.log('\n\nLoading matterhorn app as main application: ' + colourize(appFile, purple) + '\n');

function findFile(type, ident, app, cb){

	if(app.dir === undefined){
		_.errout('no directory defined for app: ' + sys.inspect(app));
	}

	var typeDir = app.dir + '/' + type;
	var fileIdent = ident + '.' + type;
	
	fs.readFile(typeDir + '/' + fileIdent, 'utf8', function(err, str){
		if(err) _.errout(err);
		cb(err, fileIdent, str);
	});
}

function findFiles(type, ident, app, cb){

	var context = globalContext[type];
	if(context[ident]){
	
		var c = context[ident];
		for(var i=0;i<c.length;++i){
			cb(c[i].name, c[i].content, true);
		}
		return;
	}

	findFile(type, ident, app, function(err, name, content){
		if(err){
			sys.debug('cannot find: ' + type + '/' + ident + '.' + type);
			sys.debug('looking in ' + app.dir);
			throw err;
		}
		
		cb(name, content);
	});
}

function finishTemplate(templateName, templateContext, app, templateContent, attachFile){

	var compiled = dust.compile(templateContent, templateName);
	dust.loadSource(compiled);
	
	if(templateContext.css){
		//TODO minify CSS if in production mode
		_.each(templateContext.css, function(c){
			findFiles('css', c, app, function(fileName, fileContents, fromCollection){
				attachFile(app,'css', fileName, fileContents);
				if(!fromCollection){
					globalContext.css[c] = [{name: fileName, content: fileContents, appName: app.name}];
				}
			});
		});
	}
	if(templateContext.js){
		//TODO minify JS if in production mode	
		_.each(templateContext.js, function(j, index){
			findFiles('js', j, app, function(fileName, fileContents, fromCollection){
				attachFile(app,'js', fileName, fileContents);
				if(!fromCollection){
					globalContext.js[j] = [{name: fileName, content: fileContents, appName: app.name}];
				}
			});
		});
	}
	
	var jsContext = globalContext.js;
	var cssContext = globalContext.css;
	
	globalContext.templates[templateName] = function(templateBindings, res){
		dust.render(templateName, templateBindings, function(err, out){
			if(err) throw err;
			
			var header = '<html><head>';
			
			_.each(templateContext.js, function(ident){
			
				var c = jsContext[ident];
				if(c === undefined) _.errout('cannot find js ' + ident);
				for(var i=0;i<c.length;++i){
					//cb(c[i].name, c[i].content);
					//console.log(ident + '->' + JSON.stringify(c[i].name));
					var url = '/js/' + c[i].appName + '/todohash/' + c[i].name;
					header += '<script src="' + url + '"></script>';
				}
			});
			_.each(templateContext.css, function(ident){
				var c = cssContext[ident];
				if(c === undefined) _.errout('cannot find css ' + ident);
				for(var i=0;i<c.length;++i){
					var url = '/css/' + c[i].appName + '/todohash/' + c[i].name;
					header += '<link type="text/css" rel="stylesheet" href="' + url + '"></link>';
				}
			});
			
			header += '</head><body>';
			var footer = '</body></html>';
			
			res.send(header + out + footer, {'Cache-Control': 'no-cache, no-store'});
		});
	}
}

function object(original) {
	function F(){}
	F.prototype = original;
	return new F();
};

function makeExpressWrapper(expressApp){

	var attached = [];
	function attachFile(app,type, name, content){
		_.assertString(name);
		_.assertString(content);
		var path = '/' + type + '/' + app.name + '/:hash/' + name;
		if(attached.indexOf(path) === -1){
			attached.push(path);
			expressApp.get(app, path, function(req, res){
				res.header('Cache-Control', 'public max-age=2592000');
				res.send(content);
			});
		}
	}
	
	var wrapper = expressApp;
	
	wrapper.model = function(app, modelIdentifier){
		var modelName;
		if(modelIdentifier.indexOf(':') === -1){
			modelName = modelIdentifier;
		}else{
			modelName = modelIdentifier.substr(modelIdentifier.indexOf(':')+1);
		}
		
		var modelFile = app.dir + '/models/' + modelName + '.js';

		if(globalContext.models[modelIdentifier]) _.errout('model identifier ' + modelIdentifier + ' already taken by file: ' + globalContext.models[modelIdentifier].file);

		globalContext.models[modelIdentifier] = require(modelFile);
		console.log(colourize(app.name, cyan) + ' model ' + colourize(modelIdentifier, green) + ' <- ' + colourize(modelFile, brown));
		
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
	wrapper.template = function(app, templateName, templateContext){
	
		var simpleTemplateContext = {js: [], css: []};
		
		extendContext(simpleTemplateContext, templateContext);
		doInclude(simpleTemplateContext, templateContext);
	
		if(arguments.length !== 3) _.errout('should be 3 arguments, but there are ' + arguments.length);
	
		fs.readFile(app.dir + '/templates/' + templateName + '.dust', 'utf8', function(err, content){
			if(err) throw err;
			finishTemplate(templateName, simpleTemplateContext, app, content, attachFile);
		});
		
	}

	wrapper.css = function(app, cssCollectionName, cssList){
		
		if(arguments.length !== 3) _.errout('should be 3 arguments, but there are ' + arguments.length);
	
		var list = [];
	
		_.each(cssList, function(c, index){
			findFile('css', c, app, function(err, name, content){
				if(err) throw err;
				list[index] = {name: name, content: content, appName: app.name};
				attachFile(app,'css', name, content);
			});
		});
	
		globalContext.css[cssCollectionName] = list;
	}

	wrapper.js = function(app, jsCollectionName, jsList){

		if(arguments.length !== 3) _.errout('should be 3 arguments, but there are ' + arguments.length);
	
		var list = [];
	
		var cdl = _.latch(jsList.length, function(){
			console.log((expressApp.isSecure ? 'https' : 'http') + ' js collection ' + jsCollectionName + ' <- ' + JSON.stringify(jsList));
		});
		_.each(jsList, function(c, index){
			findFile('js', c, app, function(err, name, content){
				if(err) throw err;
				//console.log('got js: ' + name);
				list[index] = {name: name, content: content, appName: app.name};
				attachFile(app,'js', name, content);
				cdl();
			});
		});
		
		globalContext.js[jsCollectionName] = list;
	}

	wrapper.apply = function(res, templateName, templateBindings){
		globalContext.templates[templateName](templateBindings, res);
		
	}
	
	var get = expressApp.get;
	var post = expressApp.post;
	
	wrapper.get = function(app, path){
	
		var args = Array.prototype.slice.call(arguments,1);
		get.apply(expressApp, args);
		console.log((expressApp.isSecure ? 'https ' : 'http ') + colourize(app.name, cyan) + ' get ' + colourize(path, green));
	}
	
	wrapper.post = function(app, path){

		var args = Array.prototype.slice.call(arguments,1);
		post.apply(expressApp, args);
		console.log((expressApp.isSecure ? 'https ' : 'http ') + colourize(app.name, cyan) + ' post ' + colourize(path, green));
	}
	
	return wrapper;
}

var express = require('express');

app = express.createServer(
	express.bodyParser()
  , express.cookieParser());

//make express secure app actually secure
var privateKey = fs.readFileSync(process.cwd() + '/privatekey.pem').toString();
var certificate = fs.readFileSync(process.cwd() + '/certificate.pem').toString();


secureApp = express.createServer({key: privateKey, cert: certificate},
	express.bodyParser()
  , express.cookieParser());

app.configure(function(){
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});
secureApp.configure(function(){
    secureApp.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});


makeExpressWrapper(app);
makeExpressWrapper(secureApp);

secureApp.isSecure = true;

app.set('host', 'http://' + hostName);
secureApp.set('host', 'http://' + hostName);
app.set('securehost', 'https://' + hostName);
secureApp.set('securehost', 'https://' + hostName);

require(appFile);


app.listen(80);
secureApp.listen(443);


console.log('\nlistening on port 80 (and 443.)\n\n');
