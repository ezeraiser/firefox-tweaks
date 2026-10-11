import json, os
print(json.dumps({'path': os.path.abspath('memtest.xpi'), 'temporary': True}))
