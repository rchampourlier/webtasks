// Slack will send a request for each message sent on any or a specific channel.
// If trigger word has been configured on Slack, only messages starting with
// that trigger word will be sent

/**
* @param context {WebtaskContext}
*/
module.exports = function (context, done) {
  console.log('slack request: ', context.body);

  var responseText;
  var text = context.body.text;
  switch (text) {
    case "help":
      responseText = "Nice, you found the help! But sorry, I'm still a bit useless for now, I can't do anything at the moment...";
      break;
    case "":
      responseText = "Hello! You should ask me for something. A good start is `help`.";
      break;
  }
  done(null, { text: responseText });
};


