/*
* (C) Copyright 2014-2015 Kurento (http://kurento.org/)
*
* All rights reserved. This program and the accompanying materials
* are made available under the terms of the GNU Lesser General Public License
* (LGPL) version 2.1 which accompanies this distribution, and is available at
* http://www.gnu.org/licenses/lgpl-2.1.html
*
* This library is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
* Lesser General Public License for more details.
*
*/

function getopts(args, opts)
{
  var result = opts.default || {};
  args.replace(
      new RegExp("([^?=&]+)(=([^&]*))?", "g"),
      function($0, $1, $2, $3) { result[$1] = $3; });

  return result;
};

var args = getopts(location.search,
{
  default:
  {
    ws_uri: 'ws://' + location.hostname + ':8888/kurento',
    image_uri: 'http://' + location.host + '/img/mario-wings.png',
    ice_servers: undefined
  }
});

if (args.ice_servers) {
  console.log("Use ICE servers: " + args.ice_servers);
  kurentoUtils.WebRtcPeer.prototype.server.iceServers = JSON.parse(args.ice_servers);
} else {
  console.log("Use freeice")
}


function setIceCandidateCallbacks(webRtcPeer, webRtcEp, onerror)
{
  webRtcPeer.on('icecandidate', function(candidate) {
    console.log("Local candidate:",candidate);

    candidate = kurentoClient.register.complexTypes.IceCandidate(candidate);

    webRtcEp.addIceCandidate(candidate, onerror)
  });

  webRtcEp.on('OnIceCandidate', function(event) {
    var candidate = event.candidate;

    console.log("Remote candidate:",candidate);

    webRtcPeer.addIceCandidate(candidate, onerror);
  });
}


window.addEventListener("load", function(event)
{
  console = new Console();

  var pipeline;
  var filter;
  var webRtcPeer;

  var videoInput = document.getElementById('videoInput');
  var videoOutput = document.getElementById('videoOutput');

  var startButton = document.getElementById("start");
  var stopButton = document.getElementById("stop");
      stopButton.addEventListener("click", stop);

  var imageId="MyImage";
  var addImageButton = document.getElementById('addImage');
  addImageButton.addEventListener('click', addImage)
  var removeImageButton = document.getElementById('removeImage');
  removeImageButton.addEventListener('click', removeImage);

  var offsetXPercentInput =   document.getElementById('offsetXPercent');
  offsetXPercentInput.value = 0.1;
  var offsetYPercentInput = document.getElementById('offsetYPercent');
  offsetYPercentInput.value = 0.1;
  var widthPercentInput = document.getElementById('widthPercent');
  widthPercentInput.value = 0.3;
  var heightPercentInput = document.getElementById('heightPercent');
  heightPercentInput.value = 0.3;
  var keepAspectRatioInput = document.getElementById('keepAspectRatio');
  keepAspectRatioInput.checked = true;
  var centerInput = document.getElementById('center');
  centerInput.checked = true;
  var imageUriInput = document.getElementById('imageUri')
  imageUriInput.value = 'https://cdn2.iconfinder.com/data/icons/windows-8-metro-style/128/film.png'

  function removeImage(){
    if(!filter) return;
    filter.removeImage(imageId);
  }

  function addImage(){

    if(!filter) return;

    filter.removeImage(imageId)

    imageUri = args.image_uri

    //Offset of the top-left corner of the image in relation to whole viewport width
    var offsetXPercent = parseFloat(offsetXPercentInput.value);
    //Offset of the top-left corner of the image in relation to the whole viewport height
    var offsetYPercent = parseFloat(offsetYPercentInput.value);
    //With of the image in relation to whole width of the viewport (100% is whole viewport)
    var widthPercent = parseFloat(widthPercentInput.value);
    //Height of the image in relation to whole height of the viewport (100% is whole viewport)
    var heightPercent = parseFloat(heightPercentInput.value);
    var keepAspectRatio = keepAspectRatioInput.checked;
    var center = centerInput.checked;
    var imageUri = imageUriInput.value;

    //Add the image at the desired coordinates. When adding an image, you provide a name, that name can be used
    //later for removing the image
    filter.addImage(  imageId,
                      imageUri,
                      offsetXPercent,
                      offsetYPercent,
                      widthPercent,
                      heightPercent,
                      keepAspectRatio,
                      center,
    function(error) {
      if (error) return onError(error);

      console.log("Set overlay image");
    });
  }


  function stop(){
    if(webRtcPeer){
      webRtcPeer.dispose();
      webRtcPeer = null;
    }

    if(pipeline){
      pipeline.release();
      pipeline = null;
      filter = null;
    }

    hideSpinner(videoInput, videoOutput);
  }

  function onError(error) {
    if(error)
    {
      console.error(error);
      stop();
    }
  }


  startButton.addEventListener("click", function start()
  {
    console.log("WebRTC loopback starting");

    showSpinner(videoInput, videoOutput);

    var options = {
      localVideo: videoInput,
      remoteVideo: videoOutput
    };

    webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options, function(error)
    {
      if(error) return onError(error)

      this.generateOffer(onOffer)
    });
  });

  function onOffer(error, sdpOffer) {
    console.log("onOffer");

    if(error) return onError(error)

    kurentoClient(args.ws_uri, function(error, client) {
      if (error) return onError(error);

      client.create('MediaPipeline', function(error, _pipeline) {
        if (error) return onError(error);

        pipeline = _pipeline;

        console.log("Got MediaPipeline");

        pipeline.create('WebRtcEndpoint', function(error, webRtcEp) {
          if (error) return onError(error);

          setIceCandidateCallbacks(webRtcPeer, webRtcEp, onError)

          console.log("Got WebRtcEndpoint");

          webRtcEp.setOutputBitrate(300000, function(error){
            if(error) return onError(error);
            console.log("WebRtcEndpoint#setOutputBitrate successful");
          });

          webRtcEp.processOffer(sdpOffer, function(error, sdpAnswer) {
            if (error) return onError(error);

            console.log("SDP answer obtained. Processing...");

            webRtcEp.gatherCandidates(onError);
            webRtcPeer.processAnswer(sdpAnswer, onError);
          });

          //ImageOverlayFilter interface is described in KMD language here:
          //https://github.com/Kurento/kms-filters/blob/master/src/server/interface/filters.ImageOverlayFilter.kmd.json

          //We create the ImageOverlayFilter
          pipeline.create('ImageOverlayFilter', function(error, _filter) {
            if (error) return onError(error);

            filter = _filter;

            console.log("Got ImageOverlayFilter");

            console.log("Connecting...");

            client.connect(webRtcEp, filter, webRtcEp, function(error) {
              if (error) return onError(error);

              console.log("WebRtcEndpoint --> filter --> WebRtcEndpoint");
            });
          });
        });
      });
    });
  }
});


function showSpinner() {
  for (var i = 0; i < arguments.length; i++) {
    arguments[i].poster = 'img/transparent-1px.png';
    arguments[i].style.background = "center transparent url('img/spinner.gif') no-repeat";
  }
}

function hideSpinner() {
  for (var i = 0; i < arguments.length; i++) {
    arguments[i].src = '';
    arguments[i].poster = 'img/webrtc.png';
    arguments[i].style.background = '';
  }
}

/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function(event) {
  event.preventDefault();
  $(this).ekkoLightbox();
});
