function logger(req, res, next) {
  const start = Date.now();

  // Log after response is sent
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
    );
  });

  next();
}

module.exports = logger;
