var OP = globalThis.OP || (globalThis.OP = {});

OP.sites = OP.sites || {};

function readUrl(url) {
  try {
    return new URL(url);
  } catch (error) {
    return null;
  }
}

function isBilibiliHost(hostname) {
  return hostname === "bilibili.com" || hostname.endsWith(".bilibili.com");
}

OP.sites.bilibili = {
  id: "bilibili",
  entry: "all",
  matches: function (url) {
    var parsed = readUrl(url);
    return Boolean(parsed && parsed.protocol === "https:" && isBilibiliHost(parsed.hostname));
  },
  isHome: function (url) {
    var parsed = readUrl(url);
    if (!parsed || parsed.protocol !== "https:") {
      return false;
    }
    var host = parsed.hostname;
    return (host === "bilibili.com" || host === "www.bilibili.com") && parsed.pathname === "/";
  },
  isPrimary: function (url) {
    var parsed = readUrl(url);
    if (!parsed || parsed.protocol !== "https:") {
      return false;
    }
    var host = parsed.hostname;
    var path = parsed.pathname;
    if ((host === "bilibili.com" || host === "www.bilibili.com") && path === "/") {
      return true;
    }
    if (host === "www.bilibili.com" && (path.startsWith("/video/") || path.startsWith("/bangumi/") || path.indexOf("/v/popular") !== -1)) {
      return true;
    }
    return host === "search.bilibili.com";
  },
  pausePlayback: function (doc) {
    var videos = [];
    if (doc && typeof doc.querySelectorAll === "function") {
      var found = doc.querySelectorAll("video");
      var index;
      for (index = 0; index < found.length; index += 1) {
        if (!found[index].paused && !found[index].ended) {
          videos.push(found[index]);
        }
      }
    }
    videos.forEach(function (video) {
      video.pause();
    });
    return function resumePaused() {
      videos.forEach(function (video) {
        try {
          var pending = video.play();
          if (pending && typeof pending.catch === "function") {
            pending.catch(function () {});
          }
        } catch (error) {
          return;
        }
      });
    };
  }
};
