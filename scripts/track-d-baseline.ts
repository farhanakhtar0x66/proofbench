import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { gradeTrackD, hash, oracleRevision, verifyGrader } from '../implementations/bifrost-02/src/track-d/grader';

const checkout = process.argv[2];
if (!checkout) throw new Error('Pass the path to the Team Lex Speed Demon checkout.');
const revision = '45884261ae64e2c6184b534212cb466d730db336';
const source = execFileSync('git', ['-C', resolve(checkout), 'show', `${revision}:track-d/d_traverse.cpp`], {
  encoding: 'utf8', timeout: 5000,
});
const seed = 1767;
const worker = await verifyGrader();
const checks = await gradeTrackD(source, worker, seed);
console.log(JSON.stringify({
  entry: 'Team Lex Track D baseline', revision, sourceSha256: hash(source), oracle: oracleRevision, worker, seed, checks,
}, null, 2));
if (checks.some(check => check.outcome !== 'passed')) process.exitCode = 1;
