var zlib = require('zlib')
var pathModule = require('path')
var fs = require('fs')

var _ = require('underscorem')

var reqs = require('./reqs')

var u = require('./util')

var urlsForJs = {}

//hostFile(url, type, content, gzippedContent)
//unhostFile(url)
exports.load = function(app, jsName, hostFile, unhostFile, cb){
	_.assertLength(arguments, 5)

	var resolvedName = reqs.resolve(app, jsName, 'js')
	loadAndWrapJs(resolvedName.name, resolvedName.module, hostFile, unhostFile, function(err, res){
		if(err){ cb(err); return}
		
		function includeFunction(){
			var urls = urlsForJs[resolvedName.name];
			//console.log('***' + resolvedName.name + ' includes ' + JSON.stringify(urls))
			_.assertArray(urls)
			return urls;
		}
		
		cb(undefined, includeFunction)
	})	
}

var oldWrappedJs = {}

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
	refresh(cb)
	function refresh(cb){
		u.readFile.clear(path)
		u.readFile(path, function(str){
			//console.log('extracting requires ' + path)
			var requirements = reqs.extractRequires(str)
		
			var includedUrls = {}

			var mapping = {}		
			var reqCdl = _.latch(requirements.length, function(){

				//console.log('replacing requires ' + path)
				var hash = u.hashStr(str)
				var changedSource = reqs.replaceRequires(str, mapping)
				var name = pathModule.basename(path)
				var symbolHash = u.hashStr(path)
				var symbol = '_' + name.replace(/-/gi,'').replace(/\./gi,'_') + symbolHash
				var wrappedSource = 
					'var ' + symbol + ' = {};\n'+
					'var ' + symbol + '_module_wrapper = {};\n'+
					'(function(exports, module){\n' + 
					changedSource +
					'})(' + symbol + ', ' + symbol + '_module_wrapper)\n'+
					'if('+symbol+'_module_wrapper.exports !== undefined) ' + symbol+'='+symbol+'_module_wrapper.exports;'
				//console.log('zipping ' + symbol)
				zlib.gzip(wrappedSource, function(err, data){
					if(err) throw err;

					//console.log('...done zipping ' + symbol)
				
					result = {
						unzipped: wrappedSource,
						zipped: data,
						url: '/static/'+hash+'/'+name,//+'.js',
						symbol: symbol,
						path: path
					}
					
					//console.log('loaded ' + path + ' -> ' + result.url)

					if(oldWrappedJs[path]){
						//console.log('unhosting ' + oldWrappedJs[path].url)
						var oldUrl = oldWrappedJs[path].url
						unhostFile(oldUrl);
						var kk = Object.keys(urlsForJs)
						kk.forEach(function(k){
							var urls = urlsForJs[k]
							var ii = urls.indexOf(oldUrl)
							if(ii !== -1){
								//console.log('found oldUrl referenced from ' + k)
								//console.log(oldUrl + ' -> ' + result.url)
								urls.splice(ii, 1, result.url)
							}
						})
					}
					hostFile(result.url, 'js', wrappedSource, data)

					includedUrls[result.url] = true
					urlsForJs[path] = Object.keys(includedUrls)
					//console.log('urls for js ' + path + ' changed to ' + JSON.stringify(urlsForJs[path]))

					oldWrappedJs[path] = result
					
					cb(undefined, result)
				})
			})

		
			requirements.forEach(function(req){

				var r = reqs.resolve(app, req, 'js', pathModule.dirname(path))
				var firstTime = true
				

				//dependents[path].push(r.name)

				loadAndWrapJs(r.name, r.module, hostFile, unhostFile, function(err, rm){
					//console.log('cb args: ' + JSON.stringify(arguments).slice(0, 300))
					if(err) throw err
					_.assertString(r.originalName)
					mapping[r.originalName] = rm.symbol
					urlsForJs[r.name].forEach(function(url){includedUrls[url] = true;})

					//if(dependents[r.name]){
					//	dependents[path] = dependents[path].concat(dependents[r.name])//r.name].push(rm.path)
					//}

					/*if(dependents[r.name] === undefined) dependents[r.name] = {}
					dependents[r.name][path] = true
					if(dependents[path]){
						Object.keys(dependents[path]).forEach(function(p){
							dependents[r.name][p] = true
						})
					}*/
					//dependents[r.name]

					if(firstTime){
						firstTime = false
						reqCdl()
					}
				})

			})
		})
	}
})

