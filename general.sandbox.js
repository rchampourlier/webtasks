// This webtask may be used for general sandboxing.
//
// ### Requirements
//
// - This webtask is intended to be triggered manually from the webtask
//   editor.
// - Set the `webtask_host` secret with your Webtask host (e.g.
//   `wt-REPLACE-0.sandbox.auth0-extend.com`).

const https = require('https');
const _ = require('lodash');

/****************************************\
 HELPER FUNCTIONS
\****************************************/

var serializeQueryString = (obj) => {
  var str = [];
  for(var p in obj)
    if (obj.hasOwnProperty(p)) {
      str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
    }
  return str.join("&");
};

/****************************************\
 PERFORM WEBTASKS CALLS
\****************************************/
var webtaskCall = (ctx, name, payload, onSuccess, onError) => {
  var webtaskHost = ctx.secrets.webtask_host;
  var payload_data = "";
  var headers = {
    'Content-Type': 'application/json',
  };
  if (payload !== undefined) {
    payload_data = JSON.stringify(payload);
    headers = _.merge(headers, { 'Content-Length': Buffer.byteLength(payload_data) });
  }
  const options = {
    hostname: webtaskHost,
    port: 443,
    path: "/" + name,
    method: "POST",
    headers: headers
  };

  const req = https.request(options, (res) => {
    res.setEncoding('utf8');
    var dataStr = '';
    res.on('data', chunk => {
      dataStr += chunk;
    });
    res.on('end', function() {
      onSuccess(dataStr);
    });
  });

  req.on('error', e => {
    onError(e);
  });

  if (payload !== undefined) {
    req.write(payload_data);
  }
  req.end();
};

const log = (data) => { console.log(data); };

/**
* @param context {WebtaskContext}
*/
module.exports = function(ctx, cb) {
  webtaskCall(ctx, "trello.sort_by_due", { "board_id": "REPLACE", "list_id": "REPLACE" }, log, log );
  cb(null, {});
};
