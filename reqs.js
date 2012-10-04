
var pathModule = require('path')

exports.extractRequires = extractJsRequires
exports.extractFragmentRequires = extractFragmentRequires
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
	reqString = trim(reqString)
	reqString = reqString.substr(1, reqString.length-2)
	return reqString
}
function extractFragmentReqFromLine(line){
	var ri = line.indexOf('requireFragment(') + 'requireFragment('.length;
	var re = line.indexOf(')', ri)
	var reqString = line.substring(ri, re)
	reqString = trim(reqString)
	reqString = reqString.substr(1, reqString.length-2)
	return reqString
}
function lineIsRequire(line){
	var ri = line.indexOf('require(')
	var ci = line.indexOf('//')
	return (ri !== -1 && (ci === -1 || ci > ri))
}
function lineIsFragmentRequire(line){
	var ri = line.indexOf('requireFragment(')
	var ci = line.indexOf('//')
	return (ri !== -1 && (ci === -1 || ci > ri))
}
function extractRequires(str, f, isF){
	var requires = {}

	var lines = str.split('\n');
	for(var i=0;i<lines.length;++i){
		var line = lines[i];
		if(isF(line)){
			var reqString = f(line)//extractReqFromLine(line)
			requires[reqString] = true
		}
	}
	
	var res = Object.keys(requires)
	
	return res
}
function extractJsRequires(str){
	return extractRequires(str, extractReqFromLine, lineIsRequire)
}
function extractFragmentRequires(str){
	return extractRequires(str, extractFragmentReqFromLine, lineIsFragmentRequire)
}
function replaceRequires(str, substitutionNames, fragmentSubstitutionNames){

	var lines = str.split('\n');
	for(var i=0;i<lines.length;++i){
		var line = lines[i];
		if(lineIsRequire(line)){
			if(line.trim().indexOf('var') === 0){
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
		}else if(lineIsFragmentRequire(line)){
			if(line.trim().indexOf('var') === 0){
				var reqName = extractFragmentReqFromLine(line)
				var after = line.substr(line.indexOf(')')+1)
				//if(after.trim() !== '') throw new Error('may be error introduced by fragment substitution, cannot parse line safely: ' + line)
				var sub = fragmentSubstitutionNames[reqName]
				if(sub === undefined){
					console.log('got ' + JSON.stringify(fragmentSubstitutionNames))
					throw new Error('but cannot find required fragment: ' + reqName)
				}
				_.assertDefined(sub)
				lines[i] = line.substr(0, line.indexOf('=')) + ' = ' + sub + ';'+after;
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

var firefoxModuleBlacklist = ['timers', 'xhr', 'xmlhttprequest', 'ws']

function resolveRequire(currentModule, req, special, log, currentPath, currentName){
	_.assert(arguments.length >= 4)
	_.assertFunction(log)
	
	if(firefoxModuleBlacklist.indexOf(req) !== -1){
		log('ignoring browser-side require that may be the name of a module Firefox addons have to include to get basic Javascript functionality for some stupid reason: ' + req)
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
			h.originalName = req
			
			return h
		}catch(e){
			
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
					fakeResolve(currentModule.module, rr, special)
					console.log('managed to resolve module: ' + rr)
				}catch(e2){
					console.log(e2)
					throw new Error('cannot even resolve require module: ' + rr + ' of ' + req)
				}
				throw new Error('cannot resolve require: ' + req + ' from ' + currentName)
			}
		}
	}
}
