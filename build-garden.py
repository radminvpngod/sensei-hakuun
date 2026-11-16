# Builds web/garden.html (the in-app garden) from the claude.ai garden source.
import sys, re
src = open(sys.argv[1]).read()
src = src.replace('{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}',
                  '{"imports":{"three":"./vendor/three.module.min.js","three/addons/":"./vendor/addons/"}}')
assert './vendor/three.module.min.js' in src
src = src.replace('<script type="module">', '<script src="brain-client.js"></script>\n<script type="module">', 1)
open(sys.argv[2], 'w').write(src)
print('garden.html', len(src))
