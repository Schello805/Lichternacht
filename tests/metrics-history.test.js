import test from 'node:test';
import assert from 'node:assert/strict';
import { metricsChart, historySummary } from '../js/metrics-history.js';

test('history chart breaks lines at outages and never invents missing values', () => {
    const samples = [0, 30000, 200000, 230000].map((timestamp, index) => ({ timestamp, cpuPercent: index * 10, memoryPercent: 50, memoryUsed: 1024 }));
    const svg = metricsChart({ start: 0, end: 10800000, samples });
    assert.ok(svg.includes('über drei Stunden'));
    assert.equal((svg.match(/<polyline/g) || []).length, 4);
    assert.ok(!svg.includes('NaN'));
    assert.equal(historySummary(samples).cpuMax, 30);
    assert.equal(historySummary(samples).cpuAverage, 15);
    assert.equal(historySummary([{ cpuPercent: null }]).cpuMax, null);
    assert.equal(metricsChart({ start: NaN, end: 1 }), '');
});
