const assert = require('assert');
const hotspot = require('../hotspot-manager');

async function runHotspotTests() {
  console.log('🧪 Starting Hotspot Manager Test Suite...\n');

  // Test 1: Module export shapes
  assert.strictEqual(typeof hotspot.getStatus, 'function', 'getStatus must be a function');
  assert.strictEqual(typeof hotspot.startHotspot, 'function', 'startHotspot must be a function');
  assert.strictEqual(typeof hotspot.stopHotspot, 'function', 'stopHotspot must be a function');
  console.log('  ✅ hotspot-manager exports required functions');

  // Test 2: getStatus() returns predictable schema
  const status = await hotspot.getStatus();
  assert.strictEqual(typeof status, 'object', 'status must be an object');
  assert.strictEqual(typeof status.supported, 'boolean', 'status.supported must be boolean');
  assert.strictEqual(typeof status.active, 'boolean', 'status.active must be boolean');
  console.log('  ✅ getStatus() returns valid schema:', status);

  // Test 3: stopHotspot() runs cleanly without throwing
  const stopResult = await hotspot.stopHotspot();
  assert.strictEqual(typeof stopResult, 'object', 'stopHotspot must return an object');
  assert.strictEqual(typeof stopResult.success, 'boolean', 'stopResult.success must be boolean');
  console.log('  ✅ stopHotspot() executes safely');

  console.log('\n🏁 Hotspot Manager Tests Passed!\n');
}

runHotspotTests().catch((err) => {
  console.error('❌ Hotspot Test Failed:', err);
  process.exit(1);
});
