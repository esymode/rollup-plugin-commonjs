import {
	getExternalProxyId,
	getIdFromProxyId,
	getProxyId,
	HELPERS_ID,
	PROXY_SUFFIX
} from './helpers';

export function getResolveId() {
	function resolveId(importee, importer) {
		const isProxyModule = importee.endsWith(PROXY_SUFFIX);
		if (isProxyModule) {
			importee = getIdFromProxyId(importee);
		} else if (importee.startsWith('\0')) {
			if (importee === HELPERS_ID) {
				return importee;
			}
			return null;
		}

		if (importer && importer.endsWith(PROXY_SUFFIX)) {
			importer = getIdFromProxyId(importer);
		}

		return this.resolve(importee, importer, { skipSelf: true }).then(resolved => {
			if (!resolved) {
				// ESY: In this branch, the commonjs plugin seems to be handling the
				// case in which no plugin resolves this ID. Since the commonjs plugin
				// may still need to modify that ID, it does it's own resolution here,
				// instead of letting rolup handle it (maybe?). Unfortunately, unless we
				// mock out fs and path we can't allow that, so we'll instead always
				// resolve IDs via other plugins, and assert if we fail to do so.

				throw new Error(
					`Invariant: no plugin handled resolveId(${importee}, ${importer})`);
			}
			if (isProxyModule) {
				if (!resolved) {
					return { id: getExternalProxyId(importee), external: false };
				}
				resolved.id = (resolved.external ? getExternalProxyId : getProxyId)(resolved.id);
				resolved.external = false;
				return resolved;
			}
			return resolved;
		});
	}

	return resolveId;
}
