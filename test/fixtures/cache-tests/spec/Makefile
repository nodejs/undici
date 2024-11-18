saxpath ?= "lib/saxon9.jar"
saxon ?= java -classpath $(saxpath) net.sf.saxon.Transform -l
themedir ?= ../../../httpwg-theme
saxparam ?= bootstrapCssUrl='/spec/bootstrap.min.css' \
						siteJsUrl='/spec/script.mjs' \
						siteCssUrl='/spec/style.css' \
						banner='This copy of the specification has test results interspersed throughout; click on ℹ️ to see them.'
stylesheet := lib/rfcbootstrap.xslt

specs := rfc9111
TARGETS := $(addsuffix .html,$(specs))

.PHONY: all clean

all: $(TARGETS)

clean:
	rm -f $(TARGETS)

%.cleanxml: %.xml
	$(saxon) $< lib/xreffer.xslt | $(saxon) - lib/clean-for-DTD.xslt > $@

%.html: %.cleanxml $(stylesheet)
	$(saxon) $< $(stylesheet) $(saxparam) pageUrl='https://httpwg.org/specs/$@' > $@
