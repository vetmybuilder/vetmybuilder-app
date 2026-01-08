// server/routes/debug/routes.get.js
// GET /__debug__/routes
const { logger, withRequest } = require("../../lib/logger");

module.exports = (router /* , ctx */) => {
  router.get("/__debug__/routes", (req, res) => {
    const log = withRequest(req).child({ route: "__debug__/routes" });

    try {
      const out = [];

      for (const layer of router.stack || []) {
        // Main router routes
        if (layer?.route) {
          const methods = Object.keys(layer.route.methods)
            .filter((m) => layer.route.methods[m])
            .map((m) => m.toUpperCase())
            .sort();

          out.push({
            path: layer.route.path,
            methods,
          });
          continue;
        }

        // Nested router (Express mounts other routers)
        if (layer?.name === "router" && layer?.handle?.stack) {
          for (const sub of layer.handle.stack) {
            if (sub?.route) {
              const methods = Object.keys(sub.route.methods)
                .filter((m) => sub.route.methods[m])
                .map((m) => m.toUpperCase())
                .sort();

              out.push({
                path: sub.route.path,
                methods,
              });
            }
          }
        }
      }

      log.info({ count: out.length }, "Route list generated");
      return res.json({ routes: out });
    } catch (e) {
      log.error(
        { errMsg: e?.message, stack: e?.stack },
        "Failed to introspect routes"
      );
      return res.status(500).json({ error: "failed_to_introspect_routes" });
    }
  });
};