function getQueryParams(url) {
  const input = String(url || '');
  const hashIndex = input.indexOf('#');
  const withoutHash = hashIndex !== -1 ? input.substring(0, hashIndex) : input;
  const queryParams = {};
  const queryIndex = withoutHash.indexOf('?');
  if (queryIndex !== -1) {
    const query = new URLSearchParams(withoutHash.substring(queryIndex + 1));
    query.forEach((value, key) => {
      queryParams[key] = value;
    });
  }
  return queryParams;
}

function getBaseUrl(url) {
  const input = String(url || '');
  const hashIndex = input.indexOf('#');
  const withoutHash = hashIndex !== -1 ? input.substring(0, hashIndex) : input;
  const queryIndex = withoutHash.indexOf('?');
  return queryIndex !== -1 ? withoutHash.substring(0, queryIndex) : withoutHash;
}

function route() {
  const routes = [];
  return {
    add: (path, method, handler, type, options = {}) => {
      const auth = typeof options === 'boolean' ? options : Boolean(options?.auth);
      const roles = options?.roles || [];
      routes.push({ path, method, handler, type, auth, roles });
    },
    match: (url, method) => {
      const params = {};
      const queryParams = getQueryParams(url);
      
      url = getBaseUrl(url);

      const route = routes.find(r => {
        if (r.method && r.method !== method) return false;
        
        const keys = r.path.match(/:\w+/g);
        if (!keys) return r.path === url;
        const regex = new RegExp('^' + r.path.replace(/:\w+/g, '([^/]+)') + '$');
        const match = url.match(regex);
        if (match) {
          keys.forEach((key, i) => {
            params[key.slice(1)] = match[i + 1];
          });
        }
        return match;
      });

      return route ? { 
        handler: route.handler, 
        params,
        queryParams,
        type: route.type,
        auth: route.auth,
        roles: route.roles
      } : null;
    }
  };
}

module.exports = { route, getQueryParams, getBaseUrl };
