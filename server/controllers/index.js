// Serializes circulation state transitions so two RFID scans cannot borrow the same copy at once.
let circulationQueue = Promise.resolve();
function serializeCirculation(handler) {
  return (req, res, next) => {
    const current = circulationQueue.catch(() => {}).then(() => handler(req, res, next));
    circulationQueue = current.catch(() => {});
    return current;
  };
}
module.exports = { serializeCirculation };
