# The default value of .SHELLFLAGS is -c normally, or -ec in POSIX-conforming mode.
# -e exit if any individual command fails
# -c interpret first argument as "command" (`bash -c ls` vs. `bash ls`)
.SHELLFLAGS = -ec
.SHELL = /bin/bash
# https://www.gnu.org/software/make/manual/html_node/One-Shell.html
# > ONESHELL: "all the lines in [a] recipe [will] be passed to a single invocation of the shell"
.ONESHELL:

node_modules: package.json yarn.lock
	yarn --pure-lockfile

lint:
	./node_modules/.bin/prettier --loglevel warn --check .
	./node_modules/.bin/eslint --ext .ts .

lint-fix:
	./node_modules/.bin/prettier --write ./src ./test
	./node_modules/.bin/eslint --fix --ext .ts

lib: $(shell find src test -type f)
	mkdir -p lib
	node --max-old-space-size=4096 ./node_modules/.bin/tsc -p ./tsconfig.json

compose-up:
	docker-compose up -d

compose-down:
	docker-compose down

test:
	./node_modules/.bin/mocha test

.PHONY: test
