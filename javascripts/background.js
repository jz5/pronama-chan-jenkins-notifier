$(function(){
    var apiUrl = localStorage["jenkins-url"];
    var jobName = localStorage["job-name"];
    var useWebsocket   = localStorage["use-websocket"];
    var websocketUrl   = localStorage["websocket-url"];
    var notifyOnlyFail = localStorage["notify-only-fail"];

    if (apiUrl == null || jobName == null || (useWebsocket == 'true' && websocketUrl == null)) {
        return;
    }

    apiUrl = appendLastSlash(apiUrl);
    var prevBuild = -1;
    var JOB = "job/"
    var BUILD_NUMBER = "lastBuild"
    var API_SUB  = "/api/json";
    var POLLING_TIME = 60 * 1000;

    $.ajaxSetup({
        "error": function() {
            var option = {
                type: 'basic',
                title: "Failed to access to Jenkins",
                message: apiUrl,
                iconUrl: getIcon("FAILURE")
            }
            chrome.notifications.create("", option, function (id) { /* Do nothing */ });
        }
    });

    function appendLastSlash(url) {
        var lastChar = url.substring(url.length - 1);
        if (lastChar != "/") {
            return url + "/";
        }
        return url;
    }

    function isSuccess(result) {
        if (result == "SUCCESS") {
          return true
        }
        return false;
    }

    function getIcon(result) {
        var url = "images/blue.png";
        if (result == "UNSTABLE") {
            url = "images/yellow.png";
        } else if (result == "FAILURE") {
            url = "images/red.png";
        } else if (result == "ABORTED") {
            url = "images/grey.png";
        }
        return url;
    }

    function getColor(result) {
        var color = [0, 0, 255, 200];
        if (result == "UNSTABLE") {
            color =  [255, 255, 0, 200];
        } else if (result == "FAILURE") {
            color = [255, 0, 0, 200];
        } else if (result == "ABORTED") {
            color = [200, 200, 200, 200];
        }
        return color;
    }

    function getSound(result) {
        var url = "sounds/success.mp3";
        if (result == "UNSTABLE") {
            url = "sounds/unstable.mp3";
        } else if (result == "FAILURE") {
            url = "sounds/failure.mp3";
        } else if (result == "ABORTED") {
            url = "sounds/aborted.mp3";
        }
        return url;
    }

    // replace popup event
    chrome.browserAction.setPopup({popup : ""});
    chrome.browserAction.onClicked.addListener(function(tab) {
        window.open(apiUrl + JOB + jobName);
    });

    function fetch(apiUrl, num) {
        if (num == null) {
            num = BUILD_NUMBER;
        }
        var url = apiUrl + JOB + jobName + "/" + num + API_SUB;

        $.getJSON(url, function(json, result) {
            if (result != "success") {
                return;
            }
            if (prevBuild != json.number) {
                if(notifyOnlyFail == 'true' && isSuccess(json.result)) {
                    return;
                }
                prevBuild = json.number;
                chrome.browserAction.setBadgeText({text: String(json.number)});
                chrome.browserAction.setBadgeBackgroundColor({color: getColor(json.result)});

                var option = {
                    type: 'basic',
                    title: "#" + json.number + " (" + json.result + ")",
                    message: json.actions[0].causes[0].shortDescription,
                    iconUrl: getIcon(json.result)
                }
                chrome.notifications.create("", option, function (id) { /* Do nothing */ });

                audio = new Audio(getSound(json.result));
                audio.autoplay = false;
                audio.play();
            }
        });
    }

    var retryTime = 2500;
    function bind(wsUrl, apiUrl) {
        var ws = $("<div />");

        ws.bind("websocket::connect", function() {
            console.log('opened connection');
            retryTime = 5000;
        });

        ws.bind("websocket::message", function(_, obj) {
            if (!!obj.result && obj.project == jobName) {
                fetch(apiUrl, obj.number);
            }
        });

        ws.bind("websocket::error", function() {
            var option = {
                type: 'basic',
                title: "Failed to access to Jenkins Websocket Notifier. Please check your websocket URL",
                message: wsUrl,
                iconUrl: getIcon("FAILURE")
            }
            chrome.notifications.create("", option, function (id) { /* Do nothing */ });
        });

        // auto reconnect
        ws.bind('websocket::close', function() {
            console.log('closed connection');
            retryTime *= 2;
            setTimeout(function() {
                bind(websocketUrl, apiUrl);
            }, retryTime);
        });

        ws.webSocket({
            entry : wsUrl
        });
    }

    if (useWebsocket == 'true') {
        bind(websocketUrl, apiUrl);
    } else {
        fetch(apiUrl, BUILD_NUMBER); // first fetch
        setInterval(function() {
            fetch(apiUrl, BUILD_NUMBER);
        }, POLLING_TIME);
    }
});
