
PKGNAME=mnot/proxy-cache-tests


.PHONY: build
build:
	docker build --pull -t $(PKGNAME) .

.PHONY: upload
upload:
	docker push $(PKGNAME)
