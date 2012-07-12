

var mh = require('./../matterhorn')

var config = {
	name: 'test',
	host: 'localhost',
	port: 3948
};

exports.name = 'test';
exports.dir = __dirname;
exports.module = module

var homePage = {
	js: './test_js',
	css: './test_css',
	url: '/',
	cb: function(req, res, cb){}
};
app.page(exports, homePage);

mh.prepare(config, function(local, doneCb){
	local.include('test')
	doneCb()
})
