var zlib = require('zlib')
var path = require('path')
var fs = require('fs')
var crypto = require('crypto')

var _ = require('underscorem')

var reqs = require('./reqs')

exports.publishJs = function(){_.errout('not supported anymore');}

function convertString(n){
	n = n.replaceAll('/', '_')
	return n;
}

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
exports.hashStr = computeHash

var urlsForJs = {}

//hostFile(url, type, content, gzippedContent)
//unhostFile(url)
exports.loadJs = function(app, jsName, hostFile, unhostFile, cb){
	_.assertLength(arguments, 5)

	var resolvedName = reqs.resolve(app, app.dir, jsName, 'js')
	loadAndWrapJs(resolvedName.name, resolvedName.module, hostFile, unhostFile, function(res){
		
		function includeFunction(){
			var urls = urlsForJs[resolvedName];
			_.assertArray(urls)
			return urls;
		}
		
		cb(includeFunction)
	})	
}

var oldWrappedJs = {}

var loadAndWrapJs = _.memoizeAsync(function(path, app, hostFile, unhostFile, cb){
	_.assertString(path)
	
	var urls = {}
	
	var lastModTime;
	fs.watchFile(path, function (curr, prev) {
		if(curr.mtime > prev.mtime){
			console.log('updating file: ' + path);

			lastModTime = curr.mtime
			refresh(function(res){
				if(lastModTime === curr.mtime){
					loadAndWrapJs.replace(path, [res])
				}
			})
		}
	});
	refresh(cb)
	function refresh(cb){
		openJs(path, function(str){
			var requirements = reqs.extractRequires(str)
		
			var includedUrls = {}

			var mapping = {}		
			var reqCdl = _.latch(requirements.length, function(){

				var changedSource = reqs.replaceRequires(str, mapping)
				var hash = computeHash(changedSource)
				var symbol = hash + '_' + path.basename(path)
				var wrappedSource = 
					'var ' + symbol + ' = {}\n'+
					'(function(exports){\n' + 
					changedSource +
					'})(' + symbol + ')'
		
				zlib.gzip(wrappedSource, function(err, data){
					if(err) throw err;
				
					result = {
						unzipped: wrappedSource,
						zipped: data,
						url: '/static/'+symbol+'.js',
						symbol: symbol
					}
					
					console.log('loaded ' + path + ' -> ' + result.url)

					if(oldWrappedJs[path]){
						unhostFile(oldWrappedJs[path].url);
					}
					hostFile(result.url, 'js', wrappedSource, data)

					includedUrls[result.url] = true
					urlsForJs[path] = Object.keys(includedUrls)

					oldWrappedJs[path] = result
					
					cb(result)
				})
			})
		
			requirements.forEach(function(req){

				var r = reqs.resolve(app, app.dir, req, 'js')

				loadAndWrapJs(r.name, r.module, function(rm){
					mapping[r.name] = rm.symbol
					rm.included.forEach(function(url){includedUrls[url] = true;})
					reqCdl()
				})

			})
		})
	}
})

function getJsSymbol(jsName, cb){
}

var openJs = _.memoizeAsync(function(path, cb){
	fs.readFile(path, 'utf8', function(err, str){
		if(err) throw err;
		cb(str)
	})
})


