// GET /__debug__/routes
module.exports = (router /*, ctx */) => {
  router.get("/__debug__/routes", (req, res) => {
    try {
      const out = [];
      for (const layer of router.stack || []) {
        if (layer?.route) {
          const methods = Object.keys(layer.route.methods)
            .filter((m) => layer.route.methods[m])
            .map((m) => m.toUpperCase())
            .sort();
          out.push({ path: layer.route.path, methods });
        } else if (layer?.name === "router" && layer?.handle?.stack) {
          for (const sub of layer.handle.stack) {
            if (sub?.route) {
              const methods = Object.keys(sub.route.methods)
                .filter((m) => sub.route.methods[m])
                .map((m) => m.toUpperCase())
                .sort();
              out.push({ path: sub.route.path, methods });
            }
          }
        }
      }
      res.json({ routes: out });
    } catch (e) {
      console.error("[__debug__/routes] error", e);
      res.status(500).json({ error: "failed to introspect routes" });
    }
  });
};
