// Image imports resolve here under vitest. Metro turns `require('...jpg')`
// into an asset reference; node would try to parse the JPEG as JavaScript,
// which fails with "Unexpected token" on the first binary byte.
export default { uri: 'test-asset', width: 1, height: 1 };
