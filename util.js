var fs = require('fs')
var crypto = require('crypto')
var _ = require('underscorem')

function convertString(n){
	n = n.replaceAll('/', '_')
	return n;
}

function removeHashPadding(hash){
	return hash.replace(/=/gi,'').replace(/\+/gi,'_').replace(/\//gi,'_');
}
function computeHash(str){
	str = str.replace(/[ \t\r]+/g,' ')//replace all whitespace to avoid meaningless, platform-dependent differences
	
	var hash = crypto.createHash('md5');
	hash.update(str);
	var h = hash.digest('base64');
	h = removeHashPadding(h);
	return h;
}
exports.hashStr = computeHash

exports.readFile = _.memoizeAsync(function(path, cb){
	var stack = new Error().stack
	fs.readFile(path, 'utf8', function(err, str){
		if(err){
			throw new Error('error opening: ' + path + '\n' + err + '\ncalling stack:\n'+stack)
		}
		cb(str)
	})
})


