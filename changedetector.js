
var jsDetectorCookieJs = '<script type="text/javascript">';
jsDetectorCookieJs += "if(document.cookie.indexOf('hasjs') === -1){document.cookie = 'hasjs=true; expires=Fri, 3 Aug 2100 20:47:11 UTC; path=/'}";
jsDetectorCookieJs += '</script>';

exports.getDetectorStr = function(expressApp, app, config, serverStateId){

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
	
	return jsDetectorCookieJs + refreshDetectorJs;
}
