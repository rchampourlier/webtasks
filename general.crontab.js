// Provides a scheduler for other webtasks. 
//
// ### Details
//
// This webtask provides a crontab-like solution. Using this
// webtask, you can run other webtasks, without having to 
// specify a schedule for each of them. So the webtask can
// be used from other webtasks as well as from this scheduler.
//
// ### Requirements
//
// - This webtask needs to call other webtasks. Set the `webtask_host`
//   secret (e.g. `wt-REPLACE-0.sandbox.auth0-extend.com`).
//
// ### How to use
//
// Add it to your Webtask account and set the scheduler to every
// minute.

const https = require('https');
const _ = require('lodash');

/****************************************\
 HELPER FUNCTIONS
\****************************************/

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

const log = (data) => { console.log('general.crontab -- ' + data); };

/**
* @param context {WebtaskContext}
*/
module.exports = function(ctx, cb) {
  var today = new Date();
  log(today + ': day=' + today.getDay() + ',hours=' + today.getHours() + ',minutes=' + today.getMinutes());
  log(today.getTimezoneOffset());

  // Copy "Weekly Review" card every Friday at 5pm
  if (
    today.getDay() === 5 && // Friday
    today.getHours() === 17 && today.getMinutes() === 0 // 17:00 UTC
  ) {
    log('executing "Copy \"Weekly Review\" card"');
    var sourceCardId = "5a2a99d4efd866b4be2638e2";
    var targetListId = "5a4b40d23ae962ef641958c0";
    webtaskCall(ctx, "trello.copy_card", { "source_card_id": sourceCardId, "target_list_id": targetListId }, (d) => { log(d); }, (d) => { log(d); } );
  }

  cb(null, {});
};

