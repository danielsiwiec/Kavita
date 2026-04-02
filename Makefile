.PHONY: build

build:
	docker build -f Dockerfile.dev -t kavita:dans --platform linux/arm64 .
