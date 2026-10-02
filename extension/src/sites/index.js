var OP = globalThis.OP || (globalThis.OP = {});

OP.findSite = function (url) {
  var sites = OP.sites || {};
  var ids = Object.keys(sites);
  var index;
  for (index = 0; index < ids.length; index += 1) {
    var site = sites[ids[index]];
    if (site && typeof site.matches === "function" && site.matches(url)) {
      return site;
    }
  }
  return null;
};
