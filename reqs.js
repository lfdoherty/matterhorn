
var pathModule = require('path')

exports.extractRequires = extractRequires
exports.replaceRequires = replaceRequires
exports.resolve = resolveRequire

var _ = require('underscorem')


function trim(str){
	return str.replace(/^\s+|\s+$/g,'');
} 
function extractReqFromLine(line){
	var ri = line.indexOf('require(') + 'require('.length;
	var re = line.indexOf(')', ri)
	var reqString = line.substring(ri, re)
	//console.log('reqString: ' + reqString)
	reqString = trim(reqString)
	reqString = reqString.substr(1, reqString.length-2)
	//console.log('reqString after processing: ' + reqString)
	return reqString
}
function lineIsRequire(line){
	var ri = line.indexOf('require(')
	var ci = line.indexOf('//')
	return (ri !== -1 && (ci === -1 || ci > ri))
}
function extractRequires(str){
	var requires = {}

	var lines = str.split('\n');
	for(var i=0;i<lines.length;++i){
		var line = lines[i];
		if(lineIsRequire(line)){
			var reqString = extractReqFromLine(line)
			requires[reqString] = true
		}
	}
	
	var res = Object.keys(requires)
	
	return res
}

function replaceRequires(str, substitutionNames){

	var lines = str.split('\n');
	for(var i=0;i<lines.length;++i){
		var line = lines[i];
		if(lineIsRequire(line)){
			if(line.indexOf('var ') === 0){
				var reqName = extractReqFromLine(line)
				var after = line.substr(line.indexOf(')')+1)
				if(firefoxModuleBlacklist.indexOf(reqName) !== -1){
					lines[i] = line.substr(0, line.indexOf('=')) + ' = window'+after
					continue
				}
				var sub = substitutionNames[reqName]
				if(sub === undefined){
					console.log('got ' + JSON.stringify(substitutionNames))
					throw new Error('but cannot find required library: ' + reqName)
				}
				_.assertDefined(sub)
				lines[i] = line.substr(0, line.indexOf('=')) + ' = '+sub+after;
			}else{
				lines[i] = '';
			}
		}
	}	
	
	return lines.join('\n')
}

function fakeResolve(mod, path, ext){
	//console.log('trying: ' + path)
	var result = mod.resolve(path)
	if(result == undefined) throw new Error('resolve returned undefined')
	return result
}

function insertPath(req, special){
	var d = pathModule.dirname(req)
	var b = pathModule.basename(req)
	return d + '/' + special + '/' + b
}

var firefoxModuleBlacklist = ['timers', 'xhr']

function resolveRequire(currentModule, req, special, currentPath, currentName){
	if(firefoxModuleBlacklist.indexOf(req) !== -1){
		console.log('ignoring browser-side require that may be the name of a module Firefox addons have to include to get basic Javascript functionality for some stupid reason: ' + req)
		return
	}
	//console.log('resolve: ' + req)
	//_.assertLength(arguments, 3)
	_.assertString(req)
	_.assertString(special)
	//_.assertString(currentPath)
	//_.assertDefined(currentModule.module)
	if(currentModule.module === undefined){
		_.errout('module used in matterhorn must export its module as .module: ' + JSON.stringify(Object.keys(currentModule)))
	}
	currentPath = currentPath || pathModule.dirname(currentModule.module.filename)
	
	//console.log('req(' + req + ') ' + req.indexOf('./'))
	if(req.indexOf('./') === 0 || req.indexOf('../') === 0 || req.indexOf('/') === 0){
		
		var realPath = pathModule.resolve(currentPath, req)
		//console.log('resolving exact path: ' + JSON.stringify([currentPath, req]))
		try{
			//console.log('*trying: ' + realPath+'.'+special)
			require.resolve(realPath+'.'+special)
			//console.log('real: ' + realPath)
			return {
				name: realPath+'.'+special,
				module: currentModule,
				originalName: req
			}
		}catch(e){
			try{
				var otherRealPath = pathModule.resolve(currentPath, insertPath(req, special))
				//console.log('+trying: ' + otherRealPath+'.'+special)
				require.resolve(otherRealPath+'.'+special)
				//console.log('*real: ' + otherRealPath)
				return {
					name: otherRealPath+'.'+special,
					module: currentModule,
					originalName: req
				}
			}catch(e){
				console.log(e)
				throw new Error('cannot resolve exact require: ' + JSON.stringify([currentPath, req]) + ' -> ' + realPath + ' or ' + otherRealPath)
			}
		}
		return realPath
	}else{
		var rr = req.indexOf('/') !== -1 ? req.substr(0, req.indexOf('/')) : req
		var localResolve = currentModule.module.require.resolve
		try{
			//return currentModule.module.require.resolve(req)
			var h = {}
			h.module = currentModule.module.require(rr)
			var moduleDir = pathModule.dirname(h.module.module.filename)
			if(h.module.base && req === rr){
				var realPath = pathModule.resolve(moduleDir, h.module.base)+'.'+special
				return {
					name: realPath,
					module: h.module,
					originalName: req
				}
			}
			h.name = fakeResolve(currentModule.module, req, special)
			//console.log('got name: ' + h.name)
			//console.log('getting module: ' + rr)
			//console.log('&trying: ' + rr)
			h.originalName = req
			//console.log('done: ' + JSON.stringify(Object.keys(h.module)))
			/*if(h.name === 'util' || h.name === 'buffer'){
				console.log('here: ' + 'cannot include node.js libraries browser-side: ' + h.name)
				_.errout('cannot include node.js libraries browser-side: ' + h.name)
			}*/
			/*if(h.module.blacklist){
				var list = h.module.blacklist;
				//console.log('got blacklist: ' + JSON.stringify(list) + ' ' + h.name)
				//console.log(JSON.stringify(Object.keys(h.module)))
				for(var i=0;i<list.length;++i){
					var v = list[i]
					//console.log('module dir: ' + moduleDir)
					//console.log('module path: ' + h.module.module.filename)
					var realPath = pathModule.resolve(moduleDir, v)+'.'+special
					console.log(realPath + ' =? ' + h.name)
					if(realPath === h.name){
						var e = new Error('this is not a valid file to include browser-side: ' + h.name)
						e.blacklist = true
						throw e
					}
				}
			}*/
			return h
		}catch(e){
			//if(e.blacklist) throw e
			
			console.log('(' + req + ')')
			var d = pathModule.dirname(req)
			var b = pathModule.basename(req)
			try{
				return {
					name: fakeResolve(currentModule.module, insertPath(req, special), special),
					module: require(rr),
					originalName: req
				}
			}catch(e3){
				console.log(e3)
				try{
					fakeResolve(currentModule.module, rr, 'js')
					console.log('managed to resolve module')
				}catch(e2){
					console.log(e2)
					throw new Error('cannot even resolve require module: ' + rr + ' of ' + req)
				}
				//console.log(e)
				throw new Error('cannot resolve require: ' + req + ' from ' + currentName)
			}
		}
	}
}
