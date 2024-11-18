<!--
    XSLT transformation from RFC2629 XML format to HTML

    Copyright (c) 2006-2020, Julian Reschke (julian.reschke@greenbytes.de)
    All rights reserved.

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright notice,
      this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright notice,
      this list of conditions and the following disclaimer in the documentation
      and/or other materials provided with the distribution.
    * Neither the name of Julian Reschke nor the names of its contributors
      may be used to endorse or promote products derived from this software
      without specific prior written permission.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
    AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
    IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
    ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
    LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
    CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
    SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
    INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
    CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
    ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
    POSSIBILITY OF SUCH DAMAGE.
-->

<xsl:transform xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                version="2.0"

                xmlns:date="http://exslt.org/dates-and-times"
                xmlns:ed="http://greenbytes.de/2002/rfcedit"
                xmlns:exslt="http://exslt.org/common"
                xmlns:fo="http://www.w3.org/1999/XSL/Format"
                xmlns:msxsl="urn:schemas-microsoft-com:xslt"
                xmlns:myns="mailto:julian.reschke@greenbytes.de?subject=rfc2629.xslt"
                xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
                xmlns:saxon="http://saxon.sf.net/"
                xmlns:saxon-old="http://icl.com/saxon"
                xmlns:svg="http://www.w3.org/2000/svg"
                xmlns:x="http://purl.org/net/xml2rfc/ext"
                xmlns:xi="http://www.w3.org/2001/XInclude"
                xmlns:xhtml="http://www.w3.org/1999/xhtml"

                exclude-result-prefixes="date ed exslt fo msxsl myns rdf saxon saxon-old svg x xi xhtml"
                >

<xsl:strip-space elements="abstract address artset aside author back boilerplate dl figure front list middle note ol postal reference references rfc section table tbody thead tr texttable ul svg:svg"/>


<!-- PIs outside the root element, or inside the root element but before <front> -->
<xsl:variable name="global-std-pis" select="/processing-instruction('rfc') | /*/processing-instruction('rfc')[following-sibling::front]"/>

<!-- rfc authorship PI -->

<xsl:param name="xml2rfc-authorship">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="$global-std-pis"/>
    <xsl:with-param name="attr" select="'authorship'"/>
    <xsl:with-param name="default" select="'yes'"/>
  </xsl:call-template>
</xsl:param>

<!-- rfc comments PI -->

<xsl:param name="xml2rfc-comments">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="$global-std-pis"/>
    <xsl:with-param name="attr" select="'comments'"/>
    <xsl:with-param name="default" select="'no'"/>
  </xsl:call-template>
</xsl:param>

<!-- rfc compact PI -->

<xsl:param name="xml2rfc-compact">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="$global-std-pis"/>
    <xsl:with-param name="attr" select="'compact'"/>
    <xsl:with-param name="default" select="$xml2rfc-rfcedstyle"/>
  </xsl:call-template>
</xsl:param>

<!-- rfc footer PI -->

<xsl:param name="xml2rfc-footer">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="$global-std-pis"/>
    <xsl:with-param name="attr" select="'footer'"/>
  </xsl:call-template>
</xsl:param>

<!-- rfc header PI -->

<xsl:param name="xml2rfc-header">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="$global-std-pis"/>
    <xsl:with-param name="attr" select="'header'"/>
  </xsl:call-template>
</xsl:param>

<!-- rfc inline PI -->

<xsl:param name="xml2rfc-inline">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="$global-std-pis"/>
    <xsl:with-param name="attr" select="'inline'"/>
    <xsl:with-param name="default" select="'no'"/>
  </xsl:call-template>
</xsl:param>

<!-- include a table of contents if a processing instruction <?rfc?>
     exists with contents toc="yes". Can be overridden by an XSLT parameter -->

<xsl:param name="xml2rfc-toc">
  <xsl:variable name="default">
    <xsl:choose>
      <xsl:when test="/rfc/@version >= 3">yes</xsl:when>
      <xsl:otherwise>no</xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <xsl:choose>
    <xsl:when test="/rfc/@tocInclude='false'">no</xsl:when>
    <xsl:when test="/rfc/@tocInclude='true'">yes</xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="parse-pis">
        <xsl:with-param name="nodes" select="$global-std-pis"/>
        <xsl:with-param name="attr" select="'toc'"/>
        <xsl:with-param name="default" select="$default"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:param>

<!-- optional tocdepth-->

<xsl:param name="xml2rfc-tocdepth">
  <xsl:choose>
    <xsl:when test="/rfc/@tocDepth">
      <xsl:value-of select="/rfc/@tocDepth"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="parse-pis">
        <xsl:with-param name="nodes" select="$global-std-pis"/>
        <xsl:with-param name="attr" select="'tocdepth'"/>
        <xsl:with-param name="default" select="'3'"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:param>

<xsl:variable name="parsedTocDepth">
  <xsl:choose>
    <xsl:when test="$xml2rfc-tocdepth='1'">1</xsl:when>
    <xsl:when test="$xml2rfc-tocdepth='2'">2</xsl:when>
    <xsl:when test="$xml2rfc-tocdepth='3'">3</xsl:when>
    <xsl:when test="$xml2rfc-tocdepth='4'">4</xsl:when>
    <xsl:when test="$xml2rfc-tocdepth='5'">5</xsl:when>
    <xsl:otherwise>99</xsl:otherwise>
  </xsl:choose>
</xsl:variable>

<!-- suppress top block if a processing instruction <?rfc?>
     exists with contents tocblock="no". Can be overridden by an XSLT parameter -->

<xsl:param name="xml2rfc-topblock">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="$global-std-pis"/>
    <xsl:with-param name="attr" select="'topblock'"/>
    <xsl:with-param name="default" select="'yes'"/>
  </xsl:call-template>
</xsl:param>

<!-- Format to the RFC Editor's taste -->

<xsl:param name="xml2rfc-rfcedstyle">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="$global-std-pis"/>
    <xsl:with-param name="attr" select="'rfcedstyle'"/>
    <xsl:with-param name="default" select="'no'"/>
  </xsl:call-template>
</xsl:param>

<!-- the name of an automatically inserted references section -->

<xsl:param name="xml2rfc-refparent">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="$global-std-pis"/>
    <xsl:with-param name="attr" select="'refparent'"/>
    <xsl:with-param name="default" select="'References'"/>
  </xsl:call-template>
</xsl:param>

<!-- use symbolic reference names instead of numeric ones unless a processing instruction <?rfc?>
     exists with contents symrefs="no". Can be overridden by an XSLT parameter -->

<xsl:param name="xml2rfc-symrefs">
  <xsl:choose>
    <xsl:when test="/rfc/@symRefs='false'">no</xsl:when>
    <xsl:when test="/rfc/@symRefs='true'">yes</xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="parse-pis">
        <xsl:with-param name="nodes" select="$global-std-pis"/>
        <xsl:with-param name="attr" select="'symrefs'"/>
        <xsl:with-param name="default" select="'yes'"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:param>

<!-- sort references if a processing instruction <?rfc?>
     exists with contents sortrefs="yes". Can be overridden by an XSLT parameter -->

<xsl:param name="xml2rfc-sortrefs">
  <xsl:choose>
    <xsl:when test="/rfc/@sortRefs='true'">yes</xsl:when>
    <xsl:when test="/rfc/@sortRefs='false'">no</xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="parse-pis">
        <xsl:with-param name="nodes" select="$global-std-pis"/>
        <xsl:with-param name="attr" select="'sortrefs'"/>
        <xsl:with-param name="default" select="'no'"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:param>

<!-- insert editing marks if a processing instruction <?rfc?>
     exists with contents editing="yes". Can be overridden by an XSLT parameter -->

<xsl:param name="xml2rfc-editing">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="$global-std-pis"/>
    <xsl:with-param name="attr" select="'editing'"/>
    <xsl:with-param name="default" select="'no'"/>
  </xsl:call-template>
</xsl:param>

<!-- make it a private paper -->

<xsl:param name="xml2rfc-private">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="$global-std-pis"/>
    <xsl:with-param name="attr" select="'private'"/>
  </xsl:call-template>
</xsl:param>

<!-- background image? -->

<xsl:param name="xml2rfc-background">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="$global-std-pis"/>
    <xsl:with-param name="attr" select="'background'"/>
  </xsl:call-template>
</xsl:param>

<!-- override CSS? -->

<xsl:param name="xml2rfc-ext-css-resource">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'css-resource'"/>
  </xsl:call-template>
</xsl:param>

<xsl:param name="xml2rfc-ext-css-contents">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'css-contents'"/>
  </xsl:call-template>
</xsl:param>

<!-- CSS max page width -->

<xsl:param name="xml2rfc-ext-maxwidth">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'maxwidth'"/>
    <xsl:with-param name="default" select="'1000'"/>
  </xsl:call-template>
</xsl:param>

<xsl:variable name="parsedMaxwidth">
  <xsl:choose>
    <xsl:when test="string(number($xml2rfc-ext-maxwidth)) != 'NaN'">
      <xsl:value-of select="$xml2rfc-ext-maxwidth"/>
    </xsl:when>
    <xsl:when test="$xml2rfc-ext-maxwidth='none'"></xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="warning">
        <xsl:with-param name="msg" select="concat('Unsupported value of rfc-ext maxwidth PI: ', $xml2rfc-ext-maxwidth)"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:variable>

<!-- CSS styles -->

<xsl:param name="xml2rfc-ext-styles">fft-sans-serif ffb-serif ff-cleartype</xsl:param>

<xsl:variable name="styles" select="concat(' ',normalize-space($xml2rfc-ext-styles),' ')"/>

<xsl:param name="xml2rfc-ext-ff-body">
  <xsl:variable name="t">
    <xsl:if test="contains($styles,' ff-noto ')">
      <xsl:if test="contains($styles,' ffb-serif ')">
        'Noto Serif', 
      </xsl:if>
      <xsl:if test="contains($styles,' ffb-sans-serif ')">
        'Noto Sans',
      </xsl:if>
    </xsl:if>
    <xsl:if test="contains($styles,' ff-cleartype ')">
      <xsl:if test="contains($styles,' ffb-serif ')">
        cambria, georgia, 
      </xsl:if>
      <xsl:if test="contains($styles,' ffb-sans-serif ')">
        candara, calibri,
      </xsl:if>
    </xsl:if>
    <xsl:if test="contains($styles,' ffb-sans-serif ')">
      segoe, optima, arial, sans-serif,
    </xsl:if>
    serif
  </xsl:variable>
  <xsl:call-template name="ff-list">
    <xsl:with-param name="s" select="normalize-space($t)"/>
  </xsl:call-template>
</xsl:param>

<xsl:param name="xml2rfc-ext-ff-title">
  <xsl:variable name="t">
    <xsl:if test="contains($styles,' ff-noto ')">
      <xsl:if test="contains($styles,' fft-serif ')">
        'Noto Serif', 
      </xsl:if>
      <xsl:if test="contains($styles,' fft-sans-serif ')">
        'Noto Sans',
      </xsl:if>
    </xsl:if>
    <xsl:if test="contains($styles,' ff-cleartype ')">
      <xsl:if test="contains($styles,' fft-serif ')">
        cambria, georgia, 
      </xsl:if>
      <xsl:if test="contains($styles,' fft-sans-serif ')">
        candara, calibri,
      </xsl:if>
    </xsl:if>
    <xsl:if test="contains($styles,' fft-serif ')">
      serif,
    </xsl:if>
    <xsl:if test="contains($styles,' fft-sans-serif ')">
      segoe, optima, arial,
    </xsl:if>
    sans-serif
  </xsl:variable>
  <xsl:call-template name="ff-list">
    <xsl:with-param name="s" select="normalize-space($t)"/>
  </xsl:call-template>
</xsl:param>

<xsl:param name="xml2rfc-ext-ff-pre">
  <xsl:variable name="t">
    <xsl:if test="contains($styles,' ff-noto ')">
      'Roboto Mono',
    </xsl:if>
    <xsl:if test="contains($styles,' ff-cleartype ')">
      consolas, monaco,
    </xsl:if>
    monospace
  </xsl:variable>
  <xsl:call-template name="ff-list">
    <xsl:with-param name="s" select="normalize-space($t)"/>
  </xsl:call-template>
</xsl:param>

<xsl:param name="xml2rfc-ext-webfonts">
  <xsl:if test="contains($styles,' ff-noto ')">
    <xsl:if test="contains($styles,' ffb-sans-serif ') or contains($styles,' fft-sans-serif ')">
      <xsl:text>@import url('https://fonts.googleapis.com/css?family=Noto+Sans:r,b,i,bi');&#10;</xsl:text>
    </xsl:if>
    <xsl:if test="contains($styles,' ffb-serif ') or contains($styles,' fft-serif ')">
      <xsl:text>@import url('https://fonts.googleapis.com/css?family=Noto+Serif:r,b,i,bi');&#10;</xsl:text>
    </xsl:if>
    <xsl:text>@import url('https://fonts.googleapis.com/css?family=Roboto+Mono:r,b,i,bi');&#10;</xsl:text>
  </xsl:if>
</xsl:param>

<xsl:param name="xml2rfc-ext-dark-mode">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'dark-mode'"/>
    <xsl:with-param name="default" select="'no'"/>
  </xsl:call-template>
</xsl:param>

<xsl:template name="ff-list">
  <xsl:param name="s"/>
  <xsl:choose>
    <xsl:when test="not(contains($s,','))">
      <xsl:value-of select="normalize-space($s)"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="normalize-space(substring-before($s,','))"/>
      <xsl:text>, </xsl:text>
      <xsl:call-template name="ff-list">
        <xsl:with-param name="s" select="substring-after($s,',')"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<!-- include PI -->

<xsl:template name="getIncludes">
  <xsl:param name="nodes"/>
  <xsl:for-each select="$nodes">
    <xsl:variable name="uri1">
      <xsl:call-template name="parse-pis">
        <xsl:with-param name="nodes" select="."/>
        <xsl:with-param name="attr" select="'include'"/>
      </xsl:call-template>
    </xsl:variable>
    <xsl:if test="$uri1!=''">
      <xsl:variable name="tbase" select="substring-before($uri1, '?')"/>
      <xsl:variable name="base"><xsl:choose><xsl:when test="$tbase!=''"><xsl:value-of select="$tbase"/></xsl:when><xsl:otherwise><xsl:value-of select="$uri1"/></xsl:otherwise></xsl:choose></xsl:variable>
      <xsl:variable name="tquery" select="substring-after($uri1, '?')"/>
      <xsl:variable name="query"><xsl:if test="$tquery!=''">?</xsl:if><xsl:value-of select="$tquery"/></xsl:variable>
      <xsl:variable name="ends-with-xml" select="substring($base, string-length($base)-3)='.xml'"/>
      <xsl:variable name="for-draft" select="contains($base,'reference.I-D')"/>
      <xsl:variable name="uri2" select="concat($base,'.xml',$query)"/>
      <xsl:variable name="uri3r" select="concat($toolsBaseUriForRFCReferences,$base,$query)"/>
      <xsl:variable name="uri4r" select="concat($toolsBaseUriForRFCReferences,$base,'.xml',$query)"/>
      <xsl:variable name="uri3i" select="concat($toolsBaseUriForIDReferences,$base,$query)"/>
      <xsl:variable name="uri4i" select="concat($toolsBaseUriForIDReferences,$base,'.xml',$query)"/>
      <xsl:choose>
        <xsl:when test="not($ends-with-xml) and document($uri2)/reference">
          <xsl:call-template name="include-uri-warning">
            <xsl:with-param name="specified" select="$uri1"/>
            <xsl:with-param name="success" select="$uri2"/>
          </xsl:call-template>
          <myns:include from="{$uri2}" in="{generate-id(..)}">
            <xsl:copy-of select="document($uri2)"/>
          </myns:include>
        </xsl:when>
        <xsl:when test="document($uri1)/reference">
          <myns:include from="{$uri1}" in="{generate-id(..)}">
            <xsl:copy-of select="document($uri1)"/>
          </myns:include>
        </xsl:when>
        <xsl:when test="not($ends-with-xml) and $for-draft and not(contains($uri1,':')) and document($uri4i)/reference">
          <xsl:call-template name="include-uri-warning">
            <xsl:with-param name="specified" select="$uri1"/>
            <xsl:with-param name="success" select="$uri4i"/>
          </xsl:call-template>
          <myns:include from="{$uri4i}" in="{generate-id(..)}">
            <xsl:copy-of select="document($uri4i)"/>
          </myns:include>
        </xsl:when>
        <xsl:when test="not(contains($uri1,':')) and $for-draft and document($uri3i)/reference">
          <xsl:call-template name="include-uri-warning">
            <xsl:with-param name="specified" select="$uri1"/>
            <xsl:with-param name="success" select="$uri3i"/>
          </xsl:call-template>
          <myns:include from="{$uri3i}" in="{generate-id(..)}">
            <xsl:copy-of select="document($uri3i)"/>
          </myns:include>
        </xsl:when>
        <xsl:when test="not($ends-with-xml) and not(contains($uri1,':')) and document($uri4r)/reference">
          <xsl:call-template name="include-uri-warning">
            <xsl:with-param name="specified" select="$uri1"/>
            <xsl:with-param name="success" select="$uri4r"/>
          </xsl:call-template>
          <myns:include from="{$uri4r}" in="{generate-id(..)}">
            <xsl:copy-of select="document($uri4r)"/>
          </myns:include>
        </xsl:when>
        <xsl:when test="not(contains($uri1,':')) and document($uri3r)/reference">
          <xsl:call-template name="include-uri-warning">
            <xsl:with-param name="specified" select="$uri1"/>
            <xsl:with-param name="success" select="$uri3r"/>
          </xsl:call-template>
          <myns:include from="{$uri3r}" in="{generate-id(..)}">
            <xsl:copy-of select="document($uri3r)"/>
          </myns:include>
        </xsl:when>
        <xsl:otherwise/>
      </xsl:choose>
    </xsl:if>
  </xsl:for-each>
</xsl:template>

<xsl:template name="include-uri-warning">
  <xsl:param name="specified"/>
  <xsl:param name="success"/>
  <xsl:call-template name="warning">
    <xsl:with-param name="msg">include succeeded for best-guess URI <xsl:value-of select="$success"/> while <xsl:value-of select="$specified"/> was specified - you may want to adjust the include directive in order to avoid future warnings</xsl:with-param>
  </xsl:call-template>
</xsl:template>

<xsl:template name="getXIncludes">
  <xsl:param name="nodes"/>
  <xsl:for-each select="$nodes">
    <xsl:choose>
      <xsl:when test="(@parse and @parse!='xml') or @xpointer">
        <xsl:call-template name="error">
          <xsl:with-param name="msg" select="'Unsupported attributes on x:include element'"/>
        </xsl:call-template>
      </xsl:when>
      <xsl:otherwise>
        <xsl:variable name="uri">
          <!--<xsl:choose>
            <xsl:when test="starts-with(@href,'https://xml2rfc.ietf.org/public/rfc/')">
              <xsl:call-template name="warning">
                <xsl:with-param name="msg">rewriting URI to /xml2rfc.tools.ietf.org for <xsl:value-of select="@href"/> - see in order to avoid broken server's 403 response (see https://mailarchive.ietf.org/arch/msg/xml2rfc/56sDqFVKF0baqdgEjHQtxOUMf4o).</xsl:with-param>
              </xsl:call-template>
              <xsl:value-of select="concat('https://xml2rfc.tools.ietf.org/public/rfc/',substring-after(@href,'https://xml2rfc.ietf.org/public/rfc/'))"/>
            </xsl:when>
            <xsl:otherwise>-->
              <xsl:value-of select="@href"/>
            <!--</xsl:otherwise>
          </xsl:choose>-->
        </xsl:variable>
        <xsl:variable name="doc">
          <xsl:copy-of select="document($uri)"/>
        </xsl:variable>
        <xsl:if test="count(exslt:node-set($doc)) = 1">
          <myns:include from="{@href}" in="{generate-id(..)}">
            <xsl:copy-of select="$doc"/>
          </myns:include>
        </xsl:if>
        <xsl:for-each select="exslt:node-set($doc)//xi:include">
          <xsl:call-template name="error">
            <xsl:with-param name="msg" select="'Nested x:include elements are not supported'"/>
          </xsl:call-template>
        </xsl:for-each>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:for-each>
</xsl:template>

<xsl:variable name="includeDirectives">
  <xsl:call-template name="getIncludes">
    <xsl:with-param name="nodes" select="/rfc/back//references/processing-instruction('rfc')|/rfc/back//references/referencegroup/processing-instruction('rfc')"/>
  </xsl:call-template>
  <xsl:call-template name="getXIncludes">
    <xsl:with-param name="nodes" select="/rfc/back//references/xi:include|/rfc/back//references/referencegroup/xi:include"/>
  </xsl:call-template>
</xsl:variable>

<xsl:variable name="sourcedReferences">
  <xsl:for-each select="//reference[x:source/@href and not(seriesInfo)]">
    <xsl:copy>
      <xsl:variable name="f" select="document(x:source/@href)"/>
      <xsl:if test="$f/rfc/@number" myns:namespaceless-elements="xml2rfc">
        <seriesInfo name="RFC" value="{$f/rfc/@number}"/>
      </xsl:if>
      <xsl:if test="$f/rfc/@docName" myns:namespaceless-elements="xml2rfc">
        <seriesInfo name="Internet-Draft" value="{$f/@docName}"/>
      </xsl:if>
    </xsl:copy>
  </xsl:for-each>
</xsl:variable>

<!-- logging -->

<xsl:param name="xml2rfc-ext-log-level">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'log-level'"/>
    <xsl:with-param name="default" select="'WARNING'"/>
  </xsl:call-template>
</xsl:param>

<xsl:variable name="log-level">
  <xsl:call-template name="parse-log-level">
    <xsl:with-param name="level" select="$xml2rfc-ext-log-level"/>
  </xsl:call-template>
</xsl:variable>

<xsl:param name="xml2rfc-ext-abort-on">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'abort-on'"/>
    <xsl:with-param name="default" select="'OFF'"/>
  </xsl:call-template>
</xsl:param>

<xsl:variable name="abort-log-level">
  <xsl:call-template name="parse-log-level">
    <xsl:with-param name="level" select="$xml2rfc-ext-abort-on"/>
  </xsl:call-template>
</xsl:variable>

<xsl:template name="parse-log-level">
  <xsl:param name="level"/>
  <xsl:choose>
    <xsl:when test="$level='OFF'">6</xsl:when>
    <xsl:when test="$level='FATAL'">5</xsl:when>
    <xsl:when test="$level='ERROR'">4</xsl:when>
    <xsl:when test="$level='WARNING'">3</xsl:when>
    <xsl:when test="$level='INFO'">2</xsl:when>
    <xsl:when test="$level='DEBUG'">1</xsl:when>
    <xsl:when test="$level='TRACE'">0</xsl:when>
    <xsl:otherwise>
      <xsl:message>Unsupported LOG level '<xsl:value-of select="$level"/>', defaulting to 'WARNING'</xsl:message>
      <xsl:value-of select="'3'"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<!-- prettyprinting -->

<xsl:param name="xml2rfc-ext-html-pretty-print">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'html-pretty-print'"/>
  </xsl:call-template>
</xsl:param>

<xsl:variable name="prettyprint-class">
  <xsl:if test="$xml2rfc-ext-html-pretty-print">
    <xsl:value-of select="substring-before(normalize-space($xml2rfc-ext-html-pretty-print),' ')"/>
  </xsl:if>
</xsl:variable>

<xsl:variable name="prettyprint-script">
  <xsl:if test="$xml2rfc-ext-html-pretty-print">
    <xsl:value-of select="substring-after(normalize-space($xml2rfc-ext-html-pretty-print),' ')"/>
  </xsl:if>
</xsl:variable>

<!-- Unicode database -->
<xsl:param name="xml2rfc-ext-ucd-file">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'ucd-file'"/>
  </xsl:call-template>
</xsl:param>

<!-- external resource containing errata, as generated by parse-errata.xslt -->
<xsl:param name="xml2rfc-ext-errata"/>
<xsl:variable name="errata-parsed" select="document($xml2rfc-ext-errata)//erratum[@status!='Rejected']"/>

<!-- "remove in RFC phrases" -->
<xsl:variable name="note-removeInRFC">This note is to be removed before publishing as an RFC.</xsl:variable>
<xsl:variable name="section-removeInRFC">This section is to be removed before publishing as an RFC.</xsl:variable>

<!-- constant string for unnumbered parts -->
<xsl:variable name="unnumbered">unnumbered-</xsl:variable>

<!-- CSS class name remapping -->

<xsl:param name="xml2rfc-ext-css-map"/>

<xsl:template name="generate-css-class">
  <xsl:param name="name"/>
  <xsl:variable name="cssmap" select="document($xml2rfc-ext-css-map)"/>
  <xsl:variable name="entry" select="$cssmap/*/map[@from=$name]"/>
  <xsl:choose>
    <xsl:when test="$entry">
      <xsl:value-of select="$entry/@css"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="$name"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<!-- WORK IN PROGRESS; ONLY A FEW CLASSES SUPPORTED FOR NOW -->
<xsl:variable name="css-artwork"><xsl:call-template name="generate-css-class"><xsl:with-param name="name" select="'artwork'"/></xsl:call-template></xsl:variable>
<xsl:variable name="css-art-svg"><xsl:call-template name="generate-css-class"><xsl:with-param name="name" select="'art-svg'"/></xsl:call-template></xsl:variable>
<xsl:variable name="css-docstatus"><xsl:call-template name="generate-css-class"><xsl:with-param name="name" select="'docstatus'"/></xsl:call-template></xsl:variable>
<xsl:variable name="css-center"><xsl:call-template name="generate-css-class"><xsl:with-param name="name" select="'center'"/></xsl:call-template></xsl:variable>
<xsl:variable name="css-erratum"><xsl:call-template name="generate-css-class"><xsl:with-param name="name" select="'erratum'"/></xsl:call-template></xsl:variable>
<xsl:variable name="css-error"><xsl:call-template name="generate-css-class"><xsl:with-param name="name" select="'error'"/></xsl:call-template></xsl:variable>
<xsl:variable name="css-fbbutton"><xsl:call-template name="generate-css-class"><xsl:with-param name="name" select="'fbbutton'"/></xsl:call-template></xsl:variable>
<xsl:variable name="css-feedback"><xsl:call-template name="generate-css-class"><xsl:with-param name="name" select="'feedback'"/></xsl:call-template></xsl:variable>
<xsl:variable name="css-header"><xsl:call-template name="generate-css-class"><xsl:with-param name="name" select="'header'"/></xsl:call-template></xsl:variable>
<xsl:variable name="css-left"><xsl:call-template name="generate-css-class"><xsl:with-param name="name" select="'left'"/></xsl:call-template></xsl:variable>
<xsl:variable name="css-noprint"><xsl:call-template name="generate-css-class"><xsl:with-param name="name" select="'noprint'"/></xsl:call-template></xsl:variable>
<xsl:variable name="css-publishedasrfc"><xsl:call-template name="generate-css-class"><xsl:with-param name="name" select="'publishedasrfc'"/></xsl:call-template></xsl:variable>
<xsl:variable name="css-reference"><xsl:call-template name="generate-css-class"><xsl:with-param name="name" select="'reference'"/></xsl:call-template></xsl:variable>
<xsl:variable name="css-right"><xsl:call-template name="generate-css-class"><xsl:with-param name="name" select="'right'"/></xsl:call-template></xsl:variable>
<xsl:variable name="css-tcenter"><xsl:call-template name="generate-css-class"><xsl:with-param name="name" select="'tcenter'"/></xsl:call-template></xsl:variable>
<xsl:variable name="css-tleft"><xsl:call-template name="generate-css-class"><xsl:with-param name="name" select="'tleft'"/></xsl:call-template></xsl:variable>
<xsl:variable name="css-tright"><xsl:call-template name="generate-css-class"><xsl:with-param name="name" select="'tright'"/></xsl:call-template></xsl:variable>
<xsl:variable name="css-tt"><xsl:call-template name="generate-css-class"><xsl:with-param name="name" select="'tt'"/></xsl:call-template></xsl:variable>


<!-- RFC-Editor site linking -->

<xsl:param name="xml2rfc-ext-link-rfc-to-info-page">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'link-rfc-to-info-page'"/>
    <xsl:with-param name="default">
      <xsl:choose>
        <xsl:when test="$pub-yearmonth >= 201503">yes</xsl:when>
        <xsl:otherwise>no</xsl:otherwise>
      </xsl:choose>
    </xsl:with-param>
  </xsl:call-template>
</xsl:param>

<!-- DOI insertion -->

<xsl:param name="xml2rfc-ext-insert-doi">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'insert-doi'"/>
    <xsl:with-param name="default">
      <xsl:choose>
        <xsl:when test="$pub-yearmonth >= 201505">yes</xsl:when>
        <xsl:otherwise>no</xsl:otherwise>
      </xsl:choose>
    </xsl:with-param>
  </xsl:call-template>
</xsl:param>

<!-- initials handling? -->

<xsl:param name="xml2rfc-multiple-initials">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc')"/>
    <xsl:with-param name="attr" select="'multiple-initials'"/>
    <xsl:with-param name="default" select="'no'"/>
  </xsl:call-template>
</xsl:param>

<!-- paragraph links? -->

<xsl:param name="xml2rfc-ext-paragraph-links">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'paragraph-links'"/>
    <xsl:with-param name="default" select="'no'"/>
  </xsl:call-template>
</xsl:param>

<!-- extension for XML parsing in artwork -->

<xsl:param name="xml2rfc-ext-parse-xml-in-artwork">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'parse-xml-in-artwork'"/>
    <xsl:with-param name="default" select="'no'"/>
  </xsl:call-template>
</xsl:param>

<xsl:param name="xml2rfc-ext-trace-parse-xml">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'trace-parse-xml'"/>
    <xsl:with-param name="default" select="'no'"/>
  </xsl:call-template>
</xsl:param>

<!-- extension for excluding the index -->

<xsl:param name="xml2rfc-ext-include-index">
  <xsl:choose>
    <xsl:when test="/rfc/@indexInclude='false'">no</xsl:when>
    <xsl:when test="/rfc/@indexInclude='true'">yes</xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="parse-pis">
        <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
        <xsl:with-param name="attr" select="'include-index'"/>
        <xsl:with-param name="default" select="'yes'"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:param>

<!-- extension for inserting RFC metadata -->

<xsl:param name="xml2rfc-ext-insert-metadata">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'insert-metadata'"/>
    <xsl:with-param name="default" select="'yes'"/>
  </xsl:call-template>
</xsl:param>

<!-- extension for excluding DCMI properties in meta tag (RFC2731) -->

<xsl:param name="xml2rfc-ext-support-rfc2731">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'support-rfc2731'"/>
    <xsl:with-param name="default" select="'yes'"/>
  </xsl:call-template>
</xsl:param>

<!-- extension for excluding generator information -->

<xsl:param name="xml2rfc-ext-include-generator">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'include-generator'"/>
    <xsl:with-param name="default" select="'yes'"/>
  </xsl:call-template>
</xsl:param>

<!-- extension for specifying the value for <vspace> after which it's taken as a page break -->

<xsl:param name="xml2rfc-ext-vspace-pagebreak">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'vspace-pagebreak'"/>
    <xsl:with-param name="default" select="'100'"/>
  </xsl:call-template>
</xsl:param>

<!-- extension for allowing markup inside artwork -->

<xsl:param name="xml2rfc-ext-allow-markup-in-artwork">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'allow-markup-in-artwork'"/>
    <xsl:with-param name="default" select="'no'"/>
  </xsl:call-template>
</xsl:param>

<!-- extension for including references into index -->

<xsl:param name="xml2rfc-ext-include-references-in-index">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'include-references-in-index'"/>
    <xsl:with-param name="default" select="'no'"/>
  </xsl:call-template>
</xsl:param>

<!-- extension for switching the behaviour for xrefs with text content -->
<!-- 'text': as in text output, 'nothing': just the link -->

<xsl:param name="xml2rfc-ext-xref-with-text-generate">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'xref-with-text-generate-text'"/>
    <xsl:with-param name="default" select="'text'"/>
  </xsl:call-template>
</xsl:param>

<!-- position of author's section -->

<xsl:param name="xml2rfc-ext-authors-section">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'authors-section'"/>
    <xsl:with-param name="default" select="'end'"/>
  </xsl:call-template>
</xsl:param>

<!-- justification? -->

<xsl:param name="xml2rfc-ext-justification">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'justification'"/>
    <xsl:with-param name="default" select="'no'"/>
  </xsl:call-template>
</xsl:param>

<!-- switch for doublesided layout -->

<xsl:param name="xml2rfc-ext-duplex">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'duplex'"/>
    <xsl:with-param name="default" select="'no'"/>
  </xsl:call-template>
</xsl:param>

<!-- trailing dots in section numbers -->

<xsl:param name="xml2rfc-ext-sec-no-trailing-dots">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'sec-no-trailing-dots'"/>
  </xsl:call-template>
</xsl:param>

<!-- check artwork width? -->

<xsl:param name="xml2rfc-ext-check-artwork-width">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'check-artwork-width'"/>
    <xsl:with-param name="default" select="'yes'"/>
  </xsl:call-template>
</xsl:param>

<!-- choose whether or not to do mailto links -->

<xsl:param name="xml2rfc-linkmailto">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="$global-std-pis"/>
    <xsl:with-param name="attr" select="'linkmailto'"/>
    <xsl:with-param name="default" select="'yes'"/>
  </xsl:call-template>
</xsl:param>

<!-- iprnotified switch -->

<xsl:param name="xml2rfc-iprnotified">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="$global-std-pis"/>
    <xsl:with-param name="attr" select="'iprnotified'"/>
    <xsl:with-param name="default" select="'no'"/>
  </xsl:call-template>
</xsl:param>

<!-- URL templates for RFCs and Internet Drafts. -->

<!-- Reference the marked up versions over on https://tools.ietf.org/html. -->
<xsl:param name="rfcUrlFragSection" select="'section-'" />
<xsl:param name="rfcUrlFragAppendix" select="'appendix-'" />
<xsl:param name="internetDraftUrlFragSection" select="'section-'" />
<xsl:param name="internetDraftUrlFragAppendix" select="'appendix-'" />

<!-- base URI for include directive when relative reference does not resolve for RFCs -->
<xsl:param name="toolsBaseUriForRFCReferences">https://xml2rfc.tools.ietf.org/public/rfc/bibxml/</xsl:param>

<!-- base URI for include directive when relative reference does not resolve for Intetnet Drafts -->
<xsl:param name="toolsBaseUriForIDReferences">https://xml2rfc.tools.ietf.org/public/rfc/bibxml-ids/</xsl:param>

<!--templates for URI calculation -->

<xsl:param name="xml2rfc-ext-isbn-uri">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'isbn-uri'"/>
    <xsl:with-param name="default">https://www.worldcat.org/search?q=isbn:{isbn}</xsl:with-param>
  </xsl:call-template>
</xsl:param>

<xsl:template name="compute-isbn-uri">
  <xsl:param name="isbn"/>
  <xsl:call-template name="replace-substring">
    <xsl:with-param name="string" select="$xml2rfc-ext-isbn-uri"/>
    <xsl:with-param name="replace" select="'{isbn}'"/>
    <xsl:with-param name="by" select="translate($isbn,'-','')"/>
  </xsl:call-template>
</xsl:template>

<xsl:param name="xml2rfc-ext-rfc-uri">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'rfc-uri'"/>
    <!-- previously 'https://tools.ietf.org/html/rfc{rfc}' -->
    <xsl:with-param name="default">https://www.rfc-editor.org/rfc/rfc{rfc}.html</xsl:with-param>
  </xsl:call-template>
</xsl:param>

<xsl:template name="compute-rfc-uri">
  <xsl:param name="rfc"/>
  <xsl:call-template name="replace-substring">
    <xsl:with-param name="string" select="$xml2rfc-ext-rfc-uri"/>
    <xsl:with-param name="replace" select="'{rfc}'"/>
    <xsl:with-param name="by" select="$rfc"/>
  </xsl:call-template>
</xsl:template>

<xsl:param name="xml2rfc-ext-internet-draft-uri">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'internet-draft-uri'"/>
    <xsl:with-param name="default">https://tools.ietf.org/html/{internet-draft}</xsl:with-param>
  </xsl:call-template>
</xsl:param>

<xsl:template name="compute-internet-draft-uri">
  <xsl:param name="internet-draft"/>
  <xsl:param name="ref" select="."/>
  <xsl:variable name="local-link-template">
    <xsl:call-template name="parse-pis">
      <xsl:with-param name="nodes" select="$ref/processing-instruction('rfc-ext')"/>
      <xsl:with-param name="attr" select="'internet-draft-uri'"/>
    </xsl:call-template>
  </xsl:variable>
  <xsl:choose>
    <xsl:when test="$local-link-template!=''">
      <xsl:call-template name="replace-substring">
        <xsl:with-param name="string" select="$local-link-template"/>
        <xsl:with-param name="replace" select="'{internet-draft}'"/>
        <xsl:with-param name="by" select="$internet-draft"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="replace-substring">
        <xsl:with-param name="string" select="$xml2rfc-ext-internet-draft-uri"/>
        <xsl:with-param name="replace" select="'{internet-draft}'"/>
        <xsl:with-param name="by" select="$internet-draft"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:param name="xml2rfc-ext-diff-uri">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'diff-uri'"/>
    <xsl:with-param name="default">https://tools.ietf.org/rfcdiff?url2={internet-draft}</xsl:with-param>
  </xsl:call-template>
</xsl:param>

<xsl:template name="compute-diff-uri">
  <xsl:param name="name"/>
  <xsl:call-template name="replace-substring">
    <xsl:with-param name="string" select="$xml2rfc-ext-diff-uri"/>
    <xsl:with-param name="replace" select="'{internet-draft}'"/>
    <xsl:with-param name="by" select="$name"/>
  </xsl:call-template>
</xsl:template>

<xsl:param name="xml2rfc-ext-latest-diff-uri">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'latest-diff-uri'"/>
  </xsl:call-template>
</xsl:param>

<xsl:template name="compute-latest-diff-uri">
  <xsl:param name="name"/>
  <xsl:call-template name="replace-substring">
    <xsl:with-param name="string" select="$xml2rfc-ext-latest-diff-uri"/>
    <xsl:with-param name="replace" select="'{internet-draft}'"/>
    <xsl:with-param name="by" select="$name"/>
  </xsl:call-template>
</xsl:template>

<xsl:param name="xml2rfc-ext-doi-uri">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'doi-uri'"/>
    <xsl:with-param name="default">https://dx.doi.org/{doi}</xsl:with-param>
  </xsl:call-template>
</xsl:param>

<xsl:template name="compute-doi-uri">
  <xsl:param name="doi"/>
  <xsl:call-template name="replace-substring">
    <xsl:with-param name="string" select="$xml2rfc-ext-doi-uri"/>
    <xsl:with-param name="replace" select="'{doi}'"/>
    <xsl:with-param name="by" select="$doi"/>
  </xsl:call-template>
</xsl:template>

<xsl:param name="xml2rfc-ext-rfc-info-uri">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'rfc-info-uri'"/>
    <xsl:with-param name="default">
      <xsl:choose>
        <xsl:when test="$pub-yearmonth &lt; 201708">http://www.rfc-editor.org/info/{type}{no}</xsl:when>
        <xsl:otherwise>https://www.rfc-editor.org/info/{type}{no}</xsl:otherwise>
      </xsl:choose>    
    </xsl:with-param>
  </xsl:call-template>
</xsl:param>

<xsl:template name="compute-rfc-info-uri">
  <xsl:param name="type"/>
  <xsl:param name="no"/>
  <xsl:variable name="t">
    <xsl:call-template name="replace-substring">
      <xsl:with-param name="string" select="$xml2rfc-ext-rfc-info-uri"/>
      <xsl:with-param name="replace" select="'{type}'"/>
      <xsl:with-param name="by" select="$type"/>
    </xsl:call-template>
  </xsl:variable>
  <xsl:call-template name="replace-substring">
    <xsl:with-param name="string" select="$t"/>
    <xsl:with-param name="replace" select="'{no}'"/>
    <xsl:with-param name="by" select="$no"/>
  </xsl:call-template>
</xsl:template>

<xsl:param name="xml2rfc-ext-rfc-erratum-uri">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'rfc-erratum-uri'"/>
    <xsl:with-param name="default">https://www.rfc-editor.org/errata/eid{eid}</xsl:with-param>
  </xsl:call-template>
</xsl:param>

<xsl:template name="compute-rfc-erratum-uri">
  <xsl:param name="eid"/>
  <xsl:call-template name="replace-substring">
    <xsl:with-param name="string" select="$xml2rfc-ext-rfc-erratum-uri"/>
    <xsl:with-param name="replace" select="'{eid}'"/>
    <xsl:with-param name="by" select="$eid"/>
  </xsl:call-template>
</xsl:template>

<xsl:param name="xml2rfc-ext-rfc-errata-uri">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'rfc-errata-uri'"/>
    <xsl:with-param name="default">https://www.rfc-editor.org/errata/rfc{rfc}</xsl:with-param>
  </xsl:call-template>
</xsl:param>

<xsl:param name="xml2rfc-ext-draft-status-uri">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'draft-status-uri'"/>
    <xsl:with-param name="default">https://datatracker.ietf.org/doc/{draftname}</xsl:with-param>
  </xsl:call-template>
</xsl:param>

<xsl:template name="compute-draft-status-uri">
  <xsl:param name="draftname"/>
  <xsl:call-template name="replace-substring">
    <xsl:with-param name="string" select="$xml2rfc-ext-draft-status-uri"/>
    <xsl:with-param name="replace" select="'{draftname}'"/>
    <xsl:with-param name="by" select="$draftname"/>
  </xsl:call-template>
</xsl:template>

<!-- the format we're producing -->
<xsl:param name="outputExtension" select="'html'"/>

<!-- source for autorefresh -->
<xsl:param name="xml2rfc-ext-refresh-from">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'refresh-from'"/>
    <xsl:with-param name="default" select="''"/>
  </xsl:call-template>
</xsl:param>

<!-- XSLT for autorefresh -->
<xsl:param name="xml2rfc-ext-refresh-xslt">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'refresh-xslt'"/>
    <xsl:with-param name="default" select="'rfc2629.xslt'"/>
  </xsl:call-template>
</xsl:param>

<!-- interval for autorefresh -->
<xsl:param name="xml2rfc-ext-refresh-interval">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'refresh-interval'"/>
    <xsl:with-param name="default" select="10"/>
  </xsl:call-template>
</xsl:param>

<!-- for testing: switch to disable code that gets the system time -->
<xsl:param name="xml2rfc-ext-use-system-time">
  <xsl:call-template name="parse-pis">
    <xsl:with-param name="nodes" select="/processing-instruction('rfc-ext')"/>
    <xsl:with-param name="attr" select="'use-system-time'"/>
    <xsl:with-param name="default" select="'yes'"/>
  </xsl:call-template>
</xsl:param>

<!-- warning re: absent node-set ext. function -->
<xsl:variable name="node-set-warning">
  This stylesheet requires either an XSLT-1.0 processor with node-set()
  extension function, or an XSLT-2.0 processor. Therefore, parts of the
  document couldn't be displayed.
</xsl:variable>

<!-- character translation tables -->
<xsl:variable name="lcase" select="'abcdefghijklmnopqrstuvwxyz'" />
<xsl:variable name="ucase" select="'ABCDEFGHIJKLMNOPQRSTUVWXYZ'" />
<xsl:variable name="digits" select="'0123456789'" />
<xsl:variable name="alpha" select="concat($lcase,$ucase)"/>
<xsl:variable name="alnum" select="concat($alpha,$digits)"/>

<!-- build help keys for indices -->
<xsl:key name="index-first-letter"
  match="iref|reference"
    use="translate(substring(concat(/rfc/back/displayreference[@target=current()/@anchor]/@to,@anchor,@item),1,1),'abcdefghijklmnopqrstuvwxyz','ABCDEFGHIJKLMNOPQRSTUVWXYZ')" />

<xsl:key name="index-item"
  match="iref"
    use="@item" />

<xsl:key name="index-item-subitem"
  match="iref"
    use="concat(@item,'..',@subitem)" />

<xsl:key name="index-xref-by-sec"
  match="xref[@x:sec]|relref[@section]"
    use="concat(@target,'..',@x:sec,@section)" />

<xsl:key name="index-xref-by-anchor"
  match="xref[@x:rel]|relref[@relative]"
    use="concat(@target,'..',@x:rel,@relative)" />

<xsl:key name="anchor-item"
  match="//*[@anchor]"
    use="@anchor"/>

<xsl:key name="xref-item"
  match="//xref|//relref"
    use="@target"/>

<xsl:key name="extref-item"
  match="//x:ref"
    use="."/>

<!-- prefix for automatically generated anchors -->
<xsl:variable name="anchor-pref" select="'rfc.'" />

<!-- IPR version switch -->
<xsl:variable name="ipr-rfc3667" select="(
  number($rfcno) &gt; 3708) or
  not(
    (/rfc/@ipr = 'full2026') or
    (/rfc/@ipr = 'noDerivativeWorks2026') or
    (/rfc/@ipr = 'noDerivativeWorksNow') or
    (/rfc/@ipr = 'none') or
    (/rfc/@ipr = '') or
    not(/rfc/@ipr)
  )" />

<xsl:variable name="draft-fullname" select="/rfc/@docName"/>

<xsl:variable name="draft-seq">
  <xsl:call-template name="draft-sequence-number">
    <xsl:with-param name="name" select="$draft-fullname"/>
  </xsl:call-template>
</xsl:variable>

<xsl:variable name="draft-basename">
  <xsl:call-template name="draft-base-name">
    <xsl:with-param name="name" select="$draft-fullname"/>
  </xsl:call-template>
</xsl:variable>

<xsl:variable name="is-submitted-draft" select="number($draft-seq)=$draft-seq"/>

<xsl:variable name="is-rfc" select="$src/rfc/@number"/>

<xsl:variable name="rfcno">
  <xsl:value-of select="$src/rfc/@number"/>
  <xsl:if test="$is-rfc">
    <xsl:for-each select="$src/rfc/front/seriesInfo[@name='RFC']">
      <xsl:if test="number(@value) != number($src/rfc/@number)">
        <xsl:call-template name="error">
          <xsl:with-param name="msg">RFC number given in /rfc/front/seriesInfo (<xsl:value-of select="@value"/>) inconsistent with rfc element (<xsl:value-of select="$src/rfc/@number"/>)</xsl:with-param>
        </xsl:call-template>
      </xsl:if>
    </xsl:for-each>
  </xsl:if>
</xsl:variable>

<xsl:variable name="submissionType">
  <xsl:choose>
    <xsl:when test="/rfc/@submissionType='IETF' or not(/rfc/@submissionType) or /rfc/submissionType=''">IETF</xsl:when>
    <xsl:when test="/rfc/@submissionType='IAB' or /rfc/@submissionType='IRTF' or /rfc/@submissionType='independent'">
      <xsl:value-of select="/rfc/@submissionType"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="concat('(UNSUPPORTED SUBMISSION TYPE: ',/rfc/@submissionType,')')"/>
      <xsl:call-template name="error">
        <xsl:with-param name="msg" select="concat('Unsupported value for /rfc/@submissionType: ', /rfc/@submissionType)"/>
        <xsl:with-param name="inline" select="'no'"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>

  <!-- sanity check on @consensus -->
  <xsl:if test="/rfc/@consensus and /rfc/@submissionType='independent'">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg" select="concat('/rfc/@consensus meaningless with a /rfc/@submissionType value of ', /rfc/@submissionType)"/>
    </xsl:call-template>
  </xsl:if>
</xsl:variable>

<xsl:variable name="consensus">
  <xsl:choose>
    <xsl:when test="/rfc/@consensus='yes' or /rfc/@consensus='true' or not(/rfc/@consensus)">yes</xsl:when>
    <xsl:when test="/rfc/@consensus='no' or /rfc/@consensus='false'">no</xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="concat('(UNSUPPORTED VALUE FOR CONSENSUS: ',/rfc/@consensus,')')"/>
      <xsl:call-template name="error">
        <xsl:with-param name="msg" select="concat('Unsupported value for /rfc/@consensus: ', /rfc/@consensus)"/>
        <xsl:with-param name="inline" select="'no'"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:variable>

<!-- Header format as defined in RFC 5741, and deployed end of Dec 2009 -->
<xsl:variable name="header-format">
  <xsl:choose>
    <xsl:when test="$pub-yearmonth >= 201001 or
      ($rfcno=5741 or $rfcno=5742 or $rfcno=5743)"
      >2010</xsl:when>
    <xsl:otherwise/>
  </xsl:choose>
</xsl:variable>

<xsl:variable name="rfc-boilerplate">
  <xsl:choose>
    <!-- RFC boilerplate as defined in RFC 5741, and deployed end of Dec 2009 -->
    <xsl:when test="$pub-yearmonth >= 201001 or
      ($rfcno=5741 or $rfcno=5742 or $rfcno=5743)"
      >2010</xsl:when>
    <xsl:otherwise/>
  </xsl:choose>
</xsl:variable>

<!-- use https in boilerplate links? -->
<xsl:variable name="rfc-boilerplate-use-https" select="($pub-yearmonth >= 201709 and number($rfcno)!=8230 and number($rfcno)!=8325 and number($rfcno)!=8236) or number($rfcno)=8214 or number($rfcno)=8223"/>

<xsl:variable name="rfc-info-link">
  <xsl:variable name="scheme">
    <xsl:choose>
      <xsl:when test="$rfc-boilerplate-use-https">https</xsl:when>
      <xsl:otherwise>http</xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <xsl:value-of select="concat($scheme,'://www.rfc-editor.org/info/rfc',$rfcno)"/>
</xsl:variable>

<xsl:variable name="trust-license-info-link">
  <xsl:variable name="scheme">
    <xsl:choose>
      <xsl:when test="$rfc-boilerplate-use-https">https</xsl:when>
      <xsl:otherwise>http</xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <xsl:value-of select="concat($scheme,'://trustee.ietf.org/license-info')"/>
</xsl:variable>

<!-- the reference to the latest and greatest headers-and-boilerplates document -->
<xsl:variable name="hab-reference" myns:namespaceless-elements="xml2rfc">
  <eref>
    <xsl:choose>
      <xsl:when test="$pub-yearmonth >= 201606 or ($rfcno=7846 or $rfcno=7865 or $rfcno=7866 or $rfcno=7873 or $rfcno=7879 or $rfcno=7892)"><xsl:attribute name="target">https://tools.ietf.org/html/rfc7841#section-2</xsl:attribute>Section 2 of RFC 7841</xsl:when>
      <xsl:otherwise><xsl:attribute name="target">https://tools.ietf.org/html/rfc5741#section-2</xsl:attribute>Section 2 of RFC 5741</xsl:otherwise>
    </xsl:choose>
  </eref>
</xsl:variable>

<xsl:variable name="id-boilerplate">
  <xsl:choose>
    <!-- ID boilerplate approved by IESG on Jan 14 2010-->
    <xsl:when test="$pub-yearmonth >= 201004"
      >2010</xsl:when>
    <xsl:otherwise/>
  </xsl:choose>
</xsl:variable>

<xsl:variable name="ipr-rfc4748" select="(
  $ipr-rfc3667 and
    ( number($rfcno) &gt;= 4715 and ( number($rfcno)!=4718 and number($rfcno)!=4735 and number($rfcno)!= 4749 ))
    or
    ( number($rfcno)=4578 or number($rfcno)=4582 or number($rfcno)=4583 or number($rfcno)=4628 or number($rfcno)=4629 or number($rfcno)=4639 or number($rfcno)=4651 or number($rfcno)=4682 or number($rfcno)=4684 or number($rfcno)=4695 or number($rfcno)=4696 )
    or
    ( not($is-rfc) and $pub-yearmonth >= 200611)
  )" />

<xsl:variable name="ipr-2007-08" select="(
  $ipr-rfc4748 and
    (
      (number($rfcno) &gt; 5000
        and number($rfcno) != 5020
        and number($rfcno) != 5021
        and number($rfcno) != 5034
        and number($rfcno) != 5052
        and number($rfcno) != 5065
        and number($rfcno) != 5094) or
      ($xml2rfc-ext-pub-year >= 2008) or
      (not($is-rfc) and $pub-yearmonth >= 200709)
    )
  )" />

<xsl:variable name="ipr-2008-11" select="(
    $is-rfc and $pub-yearmonth >= 200811
  )
  or
  (
    /rfc/@ipr = 'trust200811' or
    /rfc/@ipr = 'noModificationTrust200811' or
    /rfc/@ipr = 'noDerivativesTrust200902' or
    /rfc/@ipr = 'trust200902' or
    /rfc/@ipr = 'noModificationTrust200902' or
    /rfc/@ipr = 'noDerivativesTrust200902' or
    /rfc/@ipr = 'pre5378Trust200902'
  )" />

<xsl:variable name="ipr-2009-02" select="(
    $ipr-2008-11 and $pub-yearmonth >= 200902
  )" />

<!-- this makes the Sep 2009 TLP text depend on the publication date to be >= 2009-11
     for IDs, and around 2009-09 for RFCs-->
<xsl:variable name="ipr-2009-09" select="(
    ( not($is-rfc) and $pub-yearmonth >= 200911 )
    or
    (
      $is-rfc and $pub-yearmonth >= 200909 and
      $rfcno!=5582 and $rfcno!=5621 and $rfcno!=5632 and $rfcno!=5645 and $rfcno!=5646 and $rfcno!=5681
    )
  )" />

<!-- this makes the Jan 2010 TLP text depend on the publication date to be >= 2010-04
     for IDs, and around 2010-01 for RFCs-->
<xsl:variable name="ipr-2010-01" select="(
    ( not($is-rfc) and $pub-yearmonth >= 201004 )
    or
    (
      $is-rfc and ($pub-yearmonth >= 201001 or
      $rfcno=5741 or $rfcno=5742 or $rfcno=5743)
    )
  )" />

<!-- see http://mailman.rfc-editor.org/pipermail/rfc-interest/2009-June/001373.html -->
<!-- for IDs, implement the change as 2009-11 -->
<xsl:variable name="abstract-first" select="(
    ($is-rfc and $pub-yearmonth >= 200907)
    or
    (not($is-rfc) and $pub-yearmonth >= 200911)
  )" />

<!-- RFC 7322 changed the placement of notes -->
<xsl:variable name="notes-follow-abstract" select="(
    ($is-rfc and $rfcno >= 7200)
    or
    ($pub-yearmonth >= 201409)
  )" />

<!-- funding switch -->
<xsl:variable name="funding0" select="(
  $rfcno &gt; 2499) or
  (not($is-rfc) and /rfc/@docName and $xml2rfc-ext-pub-year &gt;= 1999
  )" />

<xsl:variable name="funding1" select="(
  $rfcno &gt; 4320) or
  (not($is-rfc) and /rfc/@docName and $xml2rfc-ext-pub-year &gt;= 2006
  )" />

<xsl:variable name="no-funding" select="$ipr-2007-08"/>

<xsl:variable name="no-copylong" select="$ipr-2008-11 or /rfc/@ipr='none'"/>

<!-- will document have an index -->
<xsl:variable name="has-index" select="(//iref or (//xref and $xml2rfc-ext-include-references-in-index='yes')) and $xml2rfc-ext-include-index!='no'" />

<!-- does the document contain edits? -->
<xsl:variable name="has-edits" select="//ed:ins | //ed:del | //ed:replace" />

<!-- does the document have a published-as-rfc link? -->
<xsl:variable name="published-as-rfc" select="/*/x:link[@rel='Alternate' and starts-with(@title,'RFC')]"/>


<xsl:template match="text()[not(ancestor::artwork or ancestor::sourcecode)]">
  <xsl:variable name="ws" select="'&#9;&#10;&#13;&#32;'"/>
  <xsl:variable name="starts-with-ws" select="'' = translate(substring(.,1,1),$ws,'')"/>
  <xsl:variable name="ends-with-ws" select="'' = translate(substring(.,string-length(.),1),$ws,'')"/>
  <xsl:variable name="normalized" select="normalize-space(.)"/>
  <!--<xsl:message> Orig: "<xsl:value-of select="."/>"</xsl:message>
  <xsl:message>Start: "<xsl:value-of select="$starts-with-ws"/>"</xsl:message>
  <xsl:message>  End: "<xsl:value-of select="$ends-with-ws"/>"</xsl:message> -->
  <xsl:if test="$starts-with-ws">
    <xsl:variable name="t">
      <xsl:for-each select="preceding-sibling::node()">
        <xsl:choose>
          <xsl:when test="self::text()">
            <xsl:value-of select="."/>
          </xsl:when>
          <xsl:when test="self::*">
            <xsl:apply-templates select="."/>
          </xsl:when>
          <xsl:otherwise/>
        </xsl:choose>
      </xsl:for-each>
    </xsl:variable>
    <xsl:variable name="text-before" select="normalize-space($t)"/>
    <xsl:if test="$text-before!=''">
      <xsl:text> </xsl:text>
    </xsl:if>
  </xsl:if>
  <xsl:value-of select="$normalized"/>
  <xsl:if test="$ends-with-ws and $normalized!=''">
    <xsl:variable name="t">
      <xsl:for-each select="following-sibling::node()">
        <xsl:choose>
          <xsl:when test="self::text()">
            <xsl:value-of select="."/>
          </xsl:when>
          <xsl:when test="self::*">
            <xsl:apply-templates select="."/>
          </xsl:when>
          <xsl:otherwise/>
        </xsl:choose>
      </xsl:for-each>
    </xsl:variable>
    <xsl:variable name="text-after" select="normalize-space($t)"/>
    <xsl:if test="$text-after!='' and substring($t,1,1)!=' '">
      <xsl:text> </xsl:text>
    </xsl:if>
  </xsl:if>
</xsl:template>


<xsl:template match="abstract">
  <xsl:call-template name="check-no-text-content"/>
  <section>
    <xsl:call-template name="copy-anchor"/>
    <h2 id="{$anchor-pref}abstract"><a href="#{$anchor-pref}abstract">Abstract</a></h2>
    <xsl:call-template name="insert-errata">
      <xsl:with-param name="section" select="'abstract'"/>
    </xsl:call-template>
    <xsl:apply-templates />
  </section>
</xsl:template>

<msxsl:script language="JScript" implements-prefix="myns">
  function parseXml(str) {
    try {
      var doc = new ActiveXObject("MSXML2.DOMDocument");
      doc.async = false;
      if (doc.loadXML(str)) {
        return "";
      }
      else {
        return doc.parseError.reason + "\n" + doc.parseError.srcText + " (" + doc.parseError.line + "/" + doc.parseError.linepos + ")";
      }
    }
    catch(e) {
      return "";
    }
  }
</msxsl:script>

<xsl:template name="add-artwork-class">
  <xsl:variable name="v">
    <xsl:choose>
      <xsl:when test="@type='abnf' or @type='abnf2045' or @type='abnf2616' or @type='abnf7230' or @type='application/xml-dtd' or @type='inline' or @type='application/relax-ng-compact-syntax'">inline</xsl:when>
      <xsl:when test="starts-with(@type,'message/http') and contains(@type,'msgtype=&quot;request&quot;')">text2</xsl:when>
      <xsl:when test="starts-with(@type,'message/http')">text</xsl:when>
      <xsl:when test="@type='drawing' or @type='pdu'">drawing</xsl:when>
      <xsl:when test="self::sourcecode or @type='text/plain' or @type='example' or @type='code' or @type='xml' or @type='application/xml-dtd' or @type='application/json'">text</xsl:when>
      <xsl:otherwise/>
    </xsl:choose>
    <xsl:if test="@x:lang and $prettyprint-class!=''">
      <xsl:value-of select="concat(' ',$prettyprint-class)"/>
      <xsl:if test="@x:lang!=''">
        <xsl:value-of select="concat(' lang-',@x:lang)"/>
      </xsl:if>
    </xsl:if>
    <xsl:if test="contains(@type,'abnf') and $prettyprint-class!=''">
      <xsl:value-of select="concat(' ',$prettyprint-class,' lang-ietf_abnf')"/>
    </xsl:if>
  </xsl:variable>
  <xsl:if test="normalize-space($v)!=''">
    <xsl:attribute name="class"><xsl:value-of select="normalize-space($v)"/></xsl:attribute>
  </xsl:if>
</xsl:template>

<xsl:template name="insert-begin-code">
  <xsl:if test="(self::artwork and @x:is-code-component='yes') or (self::sourcecode and @markers='true')">
    <pre class="ccmarker cct">
      <xsl:text>&lt;CODE BEGINS></xsl:text>
      <xsl:if test="self::sourcecode and @name">
        <xsl:variable name="offending" select="translate(@name,concat($alnum,'-+.,;_~#'),'')"/>
        <xsl:choose>
          <xsl:when test="$offending!=''">
            <xsl:call-template name="error">
              <xsl:with-param name="msg">illegal characters in @name attribute '<xsl:value-of select="@name"/>': '<xsl:value-of select="$offending"/>'</xsl:with-param>
            </xsl:call-template>
          </xsl:when>
          <xsl:otherwise>
            <xsl:text> file "</xsl:text>
            <xsl:value-of select="@name"/>
            <xsl:text>"</xsl:text>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:if>
    </pre>
  </xsl:if>
</xsl:template>

<xsl:template name="insert-end-code">
  <xsl:if test="(self::artwork and @x:is-code-component='yes') or (self::sourcecode and @markers='true')">
    <pre class="ccmarker ccb">&lt;CODE ENDS></pre>
  </xsl:if>
</xsl:template>

<xsl:template match="artset">
  <xsl:call-template name="check-no-text-content"/>
  <!-- see https://tools.ietf.org/html/draft-levkowetz-xml2rfc-v3-implementation-notes-08#section-3.1.1 -->
  <xsl:choose>
    <xsl:when test="artwork[svg:svg or normalize-space(.)='' or @src!='']">
      <xsl:apply-templates select="artwork[svg:svg or normalize-space(.)='' or @src!=''][1]"/>
    </xsl:when>
    <xsl:when test="artwork">
      <xsl:apply-templates select="artwork[1]"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="error">
        <xsl:with-param name="msg">artset needs to contain at least one artwork child element</xsl:with-param>
      </xsl:call-template>
      <p>
        <xsl:call-template name="attach-paragraph-number-as-id"/>
        <xsl:if test="@anchor">
          <span id="{@anchor}"/>
        </xsl:if>
      </p>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template match="artwork|sourcecode">
  <xsl:if test="not(ancestor::ed:del) and $xml2rfc-ext-parse-xml-in-artwork='yes' and function-available('myns:parseXml')" use-when="function-available('myns:parseXml')">
    <xsl:if test="contains(.,'&lt;?xml')">
      <xsl:variable name="body" select="substring-after(substring-after(.,'&lt;?xml'),'?>')" />
      <xsl:if test="$body!='' and myns:parseXml($body)!=''">
        <table style="background-color: red; border-width: thin; border-style: solid; border-color: black;">
        <tr><td>
        XML PARSE ERROR; parsed the body below:
        <pre>
        <xsl:value-of select="$body"/>
        </pre>
        resulting in:
        <pre>
        <xsl:value-of select="myns:parseXml($body)" />
        </pre>
        </td></tr></table>
      </xsl:if>
    </xsl:if>
    <xsl:if test="@ed:parse-xml-after">
      <xsl:if test="myns:parseXml(string(.))!=''">
        <table style="background-color: red; border-width: thin; border-style: solid; border-color: black;">
        <tr><td>
        XML PARSE ERROR:
        <pre><xsl:value-of select="myns:parseXml(string(.))" /></pre>
        </td></tr></table>
      </xsl:if>
    </xsl:if>
  </xsl:if>
  <xsl:if test="contains(.,'&#9;')">
    <xsl:call-template name="error">
      <xsl:with-param name="msg" select="'artwork or sourcecode contains HTAB character'"/>
      <xsl:with-param name="inline" select="'no'"/>
    </xsl:call-template>
  </xsl:if>
  <xsl:variable name="display">
    <xsl:choose>
      <xsl:when test="$xml2rfc-ext-allow-markup-in-artwork='yes'">
        <xsl:apply-templates/>
      </xsl:when>
      <xsl:otherwise>
        <xsl:call-template name="text-in-artwork"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <xsl:variable name="divstyle">
    <xsl:choose>
      <xsl:when test="self::artwork and @align='right'">display:table; margin-left: auto; margin-right: 0em;</xsl:when>
      <xsl:when test="self::artwork and @align='center'">display:table; margin-left: auto; margin-right: auto;</xsl:when>
      <xsl:otherwise/>
    </xsl:choose>
  </xsl:variable>
  <xsl:variable name="prestyle">
    <xsl:choose>
      <xsl:when test="self::artwork and (@align='right' or @align='center')">margin-left: 0em;</xsl:when>
      <xsl:otherwise/>
    </xsl:choose>
  </xsl:variable>
  <div>
    <xsl:choose>
      <xsl:when test="parent::artset">
        <xsl:for-each select="..">
          <xsl:call-template name="attach-paragraph-number-as-id"/>
        </xsl:for-each>
      </xsl:when>
      <xsl:otherwise>
        <xsl:call-template name="attach-paragraph-number-as-id"/>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:if test="$divstyle!=''">
      <xsl:attribute name="style"><xsl:value-of select="$divstyle"/></xsl:attribute>
    </xsl:if>
    <xsl:call-template name="insert-begin-code"/>
    <pre>
      <xsl:call-template name="copy-anchor"/>
      <xsl:if test="$prestyle!=''">
        <xsl:attribute name="style"><xsl:value-of select="$prestyle"/></xsl:attribute>
      </xsl:if>
      <xsl:call-template name="add-artwork-class"/>
      <xsl:call-template name="insertInsDelClass"/>
      <xsl:copy-of select="$display"/>
    </pre>
    <xsl:call-template name="insert-end-code"/>
  </div>
  <xsl:call-template name="check-artwork-width">
    <xsl:with-param name="content"><xsl:apply-templates/></xsl:with-param>
    <xsl:with-param name="indent"><xsl:value-of select="string-length(@x:indent-with)"/></xsl:with-param>
  </xsl:call-template>
</xsl:template>

<xsl:template name="text-in-artwork">
  <xsl:param name="content" select="."/>
  <xsl:choose>
    <xsl:when test="contains($content,'&#9;')">
      <xsl:call-template name="text-in-artwork">
        <xsl:with-param name="content" select="substring-before($content,'&#9;')"/>
      </xsl:call-template>
      <span class="error" title="HTAB character">&#x2409;</span>
      <xsl:call-template name="text-in-artwork">
        <xsl:with-param name="content" select="substring-after($content,'&#9;')"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="$content"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<!-- special case for first text node in artwork or sourcecode -->
<xsl:template match="artwork/text()[1]|sourcecode/text()[1]" priority="9">
  <xsl:choose>
    <xsl:when test="starts-with(.,'&#10;')">
      <!-- reduce leading whitespace -->
      <xsl:call-template name="text-in-artwork">
        <xsl:with-param name="content" select="substring(.,2)"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="text-in-artwork"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<!-- other text nodes in artwork or sourcecode -->
<xsl:template match="artwork//text()|sourcecode//text()">
  <xsl:call-template name="text-in-artwork"/>
</xsl:template>

<xsl:template name="check-artwork-width">
  <xsl:param name="content"/>
  <xsl:param name="indent"/>
  <xsl:choose>
    <xsl:when test="$xml2rfc-ext-check-artwork-width='no'">
      <!-- skip check -->
    </xsl:when>
    <xsl:when test="not(contains($content,'&#10;'))">
      <xsl:if test="string-length($content) > 69 + number($indent)">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg">artwork line too long: '<xsl:value-of select="$content"/>' (<xsl:value-of select="string-length($content)"/> characters)</xsl:with-param>
        </xsl:call-template>
      </xsl:if>
    </xsl:when>
    <xsl:otherwise>
      <xsl:variable name="start" select="substring-before($content,'&#10;')"/>
      <xsl:variable name="end" select="substring-after($content,'&#10;')"/>
      <xsl:variable name="max">
        <xsl:choose>
          <xsl:when test="$indent!=''"><xsl:value-of select="69 + $indent"/></xsl:when>
          <xsl:otherwise>69</xsl:otherwise>
        </xsl:choose>
      </xsl:variable>
      <xsl:if test="string-length($start) > $max">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg">artwork line too long: '<xsl:value-of select="$start"/>' (<xsl:value-of select="string-length($start)"/> characters)</xsl:with-param>
        </xsl:call-template>
      </xsl:if>
      <xsl:call-template name="check-artwork-width">
        <xsl:with-param name="content" select="$end"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template match="artwork[xi:include]" priority="9">
  <xsl:variable name="resolved" xmlns="">
    <xsl:element name="artwork" namespace="">
      <xsl:copy-of select="@*"/>
      <xsl:for-each select="node()">
        <xsl:choose>
          <xsl:when test="self::xi:include">
            <xsl:if test="(@parse and @parse!='xml') or @xpointer">
              <xsl:call-template name="error">
                <xsl:with-param name="msg" select="'Unsupported attributes on x:include element'"/>
              </xsl:call-template>
            </xsl:if>
            <xsl:copy-of select="document(@href)"/>
          </xsl:when>
          <xsl:otherwise>
            <xsl:copy-of select="."/>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:for-each>
    </xsl:element>
  </xsl:variable>
  <xsl:apply-templates select="exslt:node-set($resolved)/*"/>
</xsl:template>

<xsl:template match="artwork[@src and starts-with(@type,'image/') or @type='svg']|artwork[svg:svg]">
  <xsl:variable name="class">
    <xsl:value-of select="$css-artwork"/>
    <xsl:text> </xsl:text>
    <xsl:if test="svg:svg">
      <xsl:value-of select="$css-art-svg"/>
    </xsl:if>
    <xsl:choose>
      <xsl:when test="@align='center'"><xsl:text> </xsl:text><xsl:value-of select="$css-center"/></xsl:when>
      <xsl:when test="@align='right'"><xsl:text> </xsl:text><xsl:value-of select="$css-right"/></xsl:when>
      <xsl:otherwise/>
    </xsl:choose>
  </xsl:variable>
  <div class="{normalize-space($class)}">
    <xsl:choose>
      <xsl:when test="parent::artset">
        <xsl:for-each select="..">
          <xsl:call-template name="attach-paragraph-number-as-id"/>
        </xsl:for-each>
      </xsl:when>
      <xsl:otherwise>
        <xsl:call-template name="attach-paragraph-number-as-id"/>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:choose>
      <xsl:when test="svg:svg">
        <xsl:choose>
          <xsl:when test="parent::artset and ../@anchor">
            <div id="{../@anchor}">
              <xsl:apply-templates select="svg:svg" mode="embed-svg"/>
            </div>
          </xsl:when>
          <xsl:when test="parent::artset and ../artwork/@anchor">
            <div id="{../artwork[@anchor][1]/@anchor}">
              <xsl:apply-templates select="svg:svg" mode="embed-svg"/>
            </div>
          </xsl:when>
          <xsl:when test="@anchor">
            <div id="{@anchor}">
              <xsl:apply-templates select="svg:svg" mode="embed-svg"/>
            </div>
          </xsl:when>
          <xsl:otherwise>
            <xsl:apply-templates select="svg:svg" mode="embed-svg"/>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:when>
      <xsl:otherwise>
        <xsl:variable name="alt">
          <xsl:choose>
            <xsl:when test="@alt!=''">
              <xsl:value-of select="@alt"/>
            </xsl:when>
            <xsl:otherwise>
              <xsl:value-of select="."/>
            </xsl:otherwise>
          </xsl:choose>
        </xsl:variable>
        <img src="{@src}">
          <xsl:if test="normalize-space($alt)!=''">
            <xsl:attribute name="alt"><xsl:value-of select="$alt"/></xsl:attribute>
          </xsl:if>
          <xsl:if test="@width and @width!=''">
            <xsl:copy-of select="@width"/>
          </xsl:if>
          <xsl:if test="@height and @height!=''">
            <xsl:copy-of select="@height"/>
          </xsl:if>
        </img>
      </xsl:otherwise>
    </xsl:choose>
  </div>
</xsl:template>

<!-- copy SVG content without inserted line no information -->
<xsl:template match="node()|@*" mode="embed-svg">
  <xsl:copy><xsl:apply-templates select="node()|@*" mode="embed-svg"/></xsl:copy>
</xsl:template>
<xsl:template match="processing-instruction('rfc-ext')[contains(.,'line-no=')]" mode="embed-svg"/>

<xsl:template match="/" mode="embed-svg">
	<xsl:copy><xsl:apply-templates select="node()"  mode="embed-svg"/></xsl:copy>
</xsl:template>

<xsl:template match="contact[ancestor::t]">
  <xsl:if test="*">
    <xsl:call-template name="info">
      <xsl:with-param name="msg">Ignoring child elements of &lt;contact> when used inside &lt;t>.</xsl:with-param>
    </xsl:call-template>
  </xsl:if>
  <xsl:value-of select="@fullname"/>
  <xsl:if test="@asciiFullname">
    <xsl:text> (</xsl:text>
    <xsl:value-of select="@asciiFullname"/>
    <xsl:text>)</xsl:text>
  </xsl:if>
</xsl:template>

<xsl:template match="author|contact|x:contributor">
  <xsl:call-template name="check-no-text-content"/>

  <address>
    <xsl:call-template name="emit-author"/>

    <xsl:if test="@asciiFullname!='' or organization/@ascii!='' or address/postal/*/@ascii">
      <br/><br/>
      <em>Additional contact information:</em>
      <br/>
      <xsl:call-template name="emit-author">
        <xsl:with-param name="ascii" select="false()"/>
      </xsl:call-template>
    </xsl:if>
  </address>
</xsl:template>

<xsl:template name="emit-postal-line">
  <xsl:param name="prefix"/>
  <xsl:param name="value"/>
  <xsl:param name="values"/>
  <xsl:param name="link"/>
  <xsl:param name="annotation"/>

  <xsl:if test="normalize-space($value)!='' or $values">
    <br/>
    <xsl:if test="$prefix!=''"><xsl:value-of select="$prefix"/>: </xsl:if>
    <xsl:choose>
      <xsl:when test="$values">
        <xsl:for-each select="exslt:node-set($values)/*">
          <xsl:choose>
            <xsl:when test="@href">
              <a href="{@href}"><xsl:value-of select="normalize-space(.)"/></a>
            </xsl:when>
            <xsl:otherwise>
              <xsl:value-of select="normalize-space(.)"/>
            </xsl:otherwise>
          </xsl:choose>
          <xsl:if test="position()!=last()">, </xsl:if>
        </xsl:for-each>
      </xsl:when>
      <xsl:when test="$link!=''">
        <a href="{$link}"><xsl:value-of select="normalize-space($value)"/></a>
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="normalize-space($value)"/>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:if test="$annotation!=''">
      <xsl:text> </xsl:text>
      <i><xsl:value-of select="$annotation"/></i>
    </xsl:if>
  </xsl:if>
</xsl:template>

<xsl:template name="emit-author-details">
  <xsl:param name="ascii"/>
  <xsl:for-each select="address">
    <xsl:choose>
      <xsl:when test="position() != 1">
        <xsl:call-template name="error">
          <xsl:with-param name="msg">Multiple &lt;address> elements inside &lt;author>, all but the first ignored.</xsl:with-param>
        </xsl:call-template>
      </xsl:when>
      <xsl:otherwise>
        <xsl:call-template name="emit-author-details2">
          <xsl:with-param name="ascii" select="$ascii"/>
        </xsl:call-template>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:for-each>
</xsl:template>

<xsl:template name="emit-postal-city">
  <xsl:param name="ascii"/>
  <xsl:call-template name="emit-postal-line">
    <xsl:with-param name="value">
      <xsl:if test="city">
        <xsl:call-template name="extract-normalized">
          <xsl:with-param name="node" select="city"/>
          <xsl:with-param name="ascii" select="$ascii"/>
        </xsl:call-template>
      </xsl:if>
    </xsl:with-param>
  </xsl:call-template>
</xsl:template>

<xsl:template name="emit-postal-city-code">
  <xsl:param name="ascii"/>
  <xsl:param name="prefix"/>
  <xsl:variable name="city">
    <xsl:if test="city">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="city"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:variable name="code">
    <xsl:if test="code">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="code"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:call-template name="emit-postal-line">
    <xsl:with-param name="value">
      <xsl:value-of select="$city"/>
      <xsl:text> </xsl:text>
      <xsl:if test="$code!=''">
        <xsl:choose>
          <xsl:when test="$prefix!='' and starts-with($code,$prefix)">
            <xsl:call-template name="warning">
              <xsl:with-param name="msg">Prefix '<xsl:value-of select="$prefix"/>' on &lt;code> '<xsl:value-of select="$code"/>' will be inserted automatically.</xsl:with-param>
            </xsl:call-template>
          </xsl:when>
          <xsl:otherwise>
            <xsl:value-of select="$prefix"/>
          </xsl:otherwise>
        </xsl:choose>
        <xsl:value-of select="$code"/>
      </xsl:if>
    </xsl:with-param>
  </xsl:call-template>
</xsl:template>

<xsl:template name="emit-postal-city-region-code">
  <xsl:param name="ascii"/>
  <xsl:variable name="city">
    <xsl:if test="city">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="city"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:variable name="region">
    <xsl:if test="region">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="region"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:variable name="code">
    <xsl:if test="code">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="code"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:call-template name="emit-postal-line">
    <xsl:with-param name="value" select="concat($city,' ',$region,' ',$code)"/>
  </xsl:call-template>
</xsl:template>

<xsl:template name="emit-postal-code-city-region">
  <xsl:param name="ascii"/>
  <xsl:param name="cr-delim" select="' '"/>
  <xsl:variable name="city">
    <xsl:if test="city">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="city"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:variable name="region">
    <xsl:if test="region">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="region"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:variable name="code">
    <xsl:if test="code">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="code"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:call-template name="emit-postal-line">
    <xsl:with-param name="value" select="concat($code,' ',$city,$cr-delim,$region)"/>
  </xsl:call-template>
</xsl:template>

<xsl:template name="emit-postal-city-comma-region-code">
  <xsl:param name="ascii"/>
  <xsl:variable name="city">
    <xsl:if test="city">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="city"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:variable name="region">
    <xsl:if test="region">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="region"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:variable name="code">
    <xsl:if test="code">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="code"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:call-template name="emit-postal-line">
    <xsl:with-param name="value">
      <xsl:value-of select="$city"/>
      <xsl:variable name="region-and-code" select="concat($region,' ',$code)"/>
      <xsl:if test="normalize-space($region-and-code)!=''">
        <xsl:if test="$city!=''">
          <xsl:text>, </xsl:text>
        </xsl:if>
        <xsl:value-of select="normalize-space($region-and-code)"/>
      </xsl:if>
    </xsl:with-param>
  </xsl:call-template>
</xsl:template>

<xsl:template name="emit-postal-city-minus-region">
  <xsl:param name="ascii"/>
  <xsl:variable name="city">
    <xsl:if test="city">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="city"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:variable name="region">
    <xsl:if test="region">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="region"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:call-template name="emit-postal-line">
    <xsl:with-param name="value">
      <xsl:value-of select="$city"/>
      <xsl:if test="$region!=''">
        <xsl:if test="$city!=''">
          <xsl:text>-</xsl:text>
        </xsl:if>
        <xsl:value-of select="$region"/>
      </xsl:if>
    </xsl:with-param>
  </xsl:call-template>
</xsl:template>

<xsl:template name="emit-postal-cityarea">
  <xsl:param name="ascii"/>
  <xsl:if test="cityarea">
    <xsl:call-template name="emit-postal-line">
      <xsl:with-param name="value">
        <xsl:call-template name="extract-normalized">
          <xsl:with-param name="node" select="cityarea"/>
          <xsl:with-param name="ascii" select="$ascii"/>
        </xsl:call-template>
      </xsl:with-param>
    </xsl:call-template>
  </xsl:if>
</xsl:template>

<xsl:template name="emit-postal-cityarea-city">
  <xsl:param name="ascii"/>
  <xsl:variable name="cityarea">
    <xsl:if test="cityarea">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="cityarea"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:variable name="city">
    <xsl:if test="city">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="city"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:call-template name="emit-postal-line">
    <xsl:with-param name="value" select="concat($cityarea,' ',$city)"/>
  </xsl:call-template>
</xsl:template>

<xsl:template name="emit-postal-code">
  <xsl:param name="ascii"/>
  <xsl:param name="prefix"/>
  <xsl:if test="code">
    <xsl:variable name="code">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="code"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:variable>
    <xsl:call-template name="emit-postal-line">
      <xsl:with-param name="value">
      <xsl:if test="$code!=''">
        <xsl:choose>
          <xsl:when test="$prefix!='' and starts-with($code,$prefix)">
            <xsl:call-template name="warning">
              <xsl:with-param name="msg">Prefix '<xsl:value-of select="$prefix"/>' on &lt;code> '<xsl:value-of select="$code"/>' will be inserted automatically.</xsl:with-param>
            </xsl:call-template>
          </xsl:when>
          <xsl:otherwise>
            <xsl:value-of select="$prefix"/>
          </xsl:otherwise>
        </xsl:choose>
        <xsl:value-of select="$code"/>
      </xsl:if>
      </xsl:with-param>
    </xsl:call-template>
  </xsl:if>
</xsl:template>

<xsl:template name="emit-postal-country">
  <xsl:param name="ascii"/>
  <xsl:if test="country">
    <xsl:call-template name="emit-postal-line">
      <xsl:with-param name="value">
        <xsl:call-template name="extract-normalized">
          <xsl:with-param name="node" select="country"/>
          <xsl:with-param name="ascii" select="$ascii"/>
        </xsl:call-template>
      </xsl:with-param>
    </xsl:call-template>
  </xsl:if>
</xsl:template>

<xsl:template name="emit-postal-code-city">
  <xsl:param name="ascii"/>
  <xsl:param name="prefix"/>
  <xsl:variable name="city">
    <xsl:if test="city">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="city"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:variable name="code">
    <xsl:if test="code">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="code"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:call-template name="emit-postal-line">
    <xsl:with-param name="value">
      <xsl:if test="$code!=''">
        <xsl:choose>
          <xsl:when test="$prefix!='' and starts-with($code,$prefix)">
            <xsl:call-template name="warning">
              <xsl:with-param name="msg">Prefix '<xsl:value-of select="$prefix"/>' on &lt;code> '<xsl:value-of select="$code"/>' will be inserted automatically.</xsl:with-param>
            </xsl:call-template>
          </xsl:when>
          <xsl:otherwise>
            <xsl:value-of select="$prefix"/>
          </xsl:otherwise>
        </xsl:choose>
        <xsl:value-of select="$code"/>
      </xsl:if>
      <xsl:text> </xsl:text>
      <xsl:value-of select="$city"/>
    </xsl:with-param>
  </xsl:call-template>
</xsl:template>

<xsl:template name="emit-postal-region">
  <xsl:param name="ascii"/>
  <xsl:if test="region">
    <xsl:call-template name="emit-postal-line">
      <xsl:with-param name="value">
        <xsl:call-template name="extract-normalized">
          <xsl:with-param name="node" select="region"/>
          <xsl:with-param name="ascii" select="$ascii"/>
        </xsl:call-template>
      </xsl:with-param>
    </xsl:call-template>
  </xsl:if>
</xsl:template>

<xsl:template name="emit-postal-region-city-cityarea">
  <xsl:param name="ascii"/>
  <xsl:variable name="city">
    <xsl:if test="city">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="city"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:variable name="region">
    <xsl:if test="region">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="region"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:variable name="cityarea">
    <xsl:if test="cityarea">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="cityarea"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:call-template name="emit-postal-line">
    <xsl:with-param name="value" select="concat($region,' ',$city,' ',$cityarea)"/>
  </xsl:call-template>
</xsl:template>

<xsl:template name="emit-postal-region-code">
  <xsl:param name="ascii"/>
  <xsl:variable name="region">
    <xsl:if test="region">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="region"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:variable name="code">
    <xsl:if test="code">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="code"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:call-template name="emit-postal-line">
    <xsl:with-param name="value" select="concat($region,' ',$code)"/>
  </xsl:call-template>
</xsl:template>

<xsl:template name="emit-postal-region-comma-code">
  <xsl:param name="ascii"/>
  <xsl:variable name="region">
    <xsl:if test="region">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="region"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:variable name="code">
    <xsl:if test="code">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="code"/>
        <xsl:with-param name="ascii" select="$ascii"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:variable>
  <xsl:call-template name="emit-postal-line">
    <xsl:with-param name="value">
      <xsl:value-of select="$region"/>
      <xsl:if test="$region!='' and $code!=''">, </xsl:if>
      <xsl:value-of select="$code"/>
    </xsl:with-param>
  </xsl:call-template>
</xsl:template>

<xsl:template name="emit-postal-street">
  <xsl:param name="ascii"/>
  <xsl:for-each select="extaddr">
    <xsl:call-template name="emit-postal-line">
      <xsl:with-param name="value">
        <xsl:call-template name="extract-normalized">
          <xsl:with-param name="ascii" select="$ascii"/>
        </xsl:call-template>
      </xsl:with-param>
    </xsl:call-template>
  </xsl:for-each>
  <xsl:for-each select="street">
    <xsl:call-template name="emit-postal-line">
      <xsl:with-param name="value">
        <xsl:call-template name="extract-normalized">
          <xsl:with-param name="ascii" select="$ascii"/>
        </xsl:call-template>
      </xsl:with-param>
    </xsl:call-template>
  </xsl:for-each>
  <xsl:for-each select="pobox">
    <xsl:call-template name="emit-postal-line">
      <xsl:with-param name="value">
        <xsl:call-template name="extract-normalized">
          <xsl:with-param name="ascii" select="$ascii"/>
        </xsl:call-template>
      </xsl:with-param>
    </xsl:call-template>
  </xsl:for-each>
</xsl:template>

<xsl:template name="author-name-for-diags">
  <xsl:variable name="author" select="ancestor-or-self::author"/>
  <xsl:choose>
    <xsl:when test="$author/@fullname">
      <xsl:value-of select="$author/@fullname"/>
    </xsl:when>
    <xsl:when test="$author/@surname">
      <xsl:value-of select="$author/@surname"/>
    </xsl:when>
    <xsl:when test="$author/organization">
      <xsl:text>(org) </xsl:text>
      <xsl:value-of select="$author/organization"/>
    </xsl:when>
    <xsl:otherwise>???</xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="emit-postal-warnings">
  <xsl:param name="nodes"/>
  <xsl:for-each select="$nodes">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">Element '<xsl:value-of select="local-name(.)"/>' with value '<xsl:value-of select="normalize-space(.)"/>' not displayed in postal address for '<xsl:call-template name="author-name-for-diags"/>'.</xsl:with-param>
    </xsl:call-template>
  </xsl:for-each>
</xsl:template>

<xsl:template name="emit-author-details2">
  <xsl:param name="ascii"/>
  <xsl:for-each select="postal">
    <xsl:choose>
      <xsl:when test="position()!=1">
        <xsl:call-template name="error">
          <xsl:with-param name="msg">Multiple &lt;postal> elements inside &lt;address> for '<xsl:call-template name="author-name-for-diags"/>', all but the first ignored.</xsl:with-param>
        </xsl:call-template>
      </xsl:when>
      <xsl:when test="not(postalLine)">
      	<xsl:variable name="ascii-country">
          <xsl:if test="country">
            <xsl:call-template name="extract-normalized">
              <xsl:with-param name="node" select="country"/>
              <xsl:with-param name="ascii" select="true()"/>
            </xsl:call-template>
          </xsl:if>
        </xsl:variable>
        <xsl:if test="$ascii and $ascii-country=''">
          <xsl:call-template name="error">
            <xsl:with-param name="msg">Postal address for '<xsl:call-template name="author-name-for-diags"/>' is incomplete because country information is missing.</xsl:with-param>
            <xsl:with-param name="inline" select="'no'"/>
          </xsl:call-template>
        </xsl:if>
        <xsl:variable name="format">
          <xsl:if test="/rfc/@version >= 3">
            <xsl:call-template name="get-country-format">
              <xsl:with-param name="country" select="$ascii-country"/>
            </xsl:call-template>
          </xsl:if>
        </xsl:variable>
        <xsl:if test="$ascii and contains($format,'%C') and street and not(city)">
          <xsl:call-template name="warning">
            <xsl:with-param name="msg">Postal address for '<xsl:call-template name="author-name-for-diags"/>' likely incomplete: street specified, but city is not.</xsl:with-param>
          </xsl:call-template>
        </xsl:if>
        <xsl:variable name="postprefix">
          <xsl:call-template name="get-country-postprefix">
            <xsl:with-param name="country" select="$ascii-country"/>
          </xsl:call-template>
        </xsl:variable>
        <xsl:choose>
          <!-- A STREETADDRESS, C CITY, D CITYAREA (DISTRICT?), Z (ZIP)CODE  -->
          <xsl:when test="$format='%A%n%C %S %Z'">
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-city-region-code"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="cityarea|sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:when test="$format='%A%n%Z %C %S'">
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-code-city-region"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="cityarea|sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:when test="$format='%A%n%Z %C/%S'">
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-code-city-region"><xsl:with-param name="ascii" select="$ascii"/><xsl:with-param name="cr-delim" select="'/'"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="cityarea|sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:when test="$format='%A%n%Z %C%n%S'">
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-code-city"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-region"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="cityarea|sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:when test="$format='%A%n%C %Z%n%S'">
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-city-code"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-region"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="cityarea|sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:when test="$format='%A%n%Z %C'">
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-code-city"><xsl:with-param name="ascii" select="$ascii"/><xsl:with-param name="prefix" select="$postprefix"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="cityarea|region|sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:when test="$format='%A%n%C %Z'">
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-city-code"><xsl:with-param name="ascii" select="$ascii"/><xsl:with-param name="prefix" select="$postprefix"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="cityarea|region|sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:when test="$format='%A%n%D%n%C%n%S %Z'">
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-cityarea"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-city"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-region-code"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:when test="$format='%A%n%D%n%C-%S%n%Z'">
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-cityarea"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-city-minus-region"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-code"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:when test="$format='%Z%n%S%C%D%n%A'">
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-cityarea"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-city"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-region-comma-code"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:when test="$format='%C%n%A%n%Z'">
            <xsl:call-template name="emit-postal-city"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-code"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="cityarea|sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:when test="$format='%Z%n%S%n%A'">
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-code"><xsl:with-param name="ascii" select="$ascii"/><xsl:with-param name="prefix" select="$postprefix"/></xsl:call-template>
            <xsl:call-template name="emit-postal-region"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="cityarea|sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:when test="$format='%A%n%Z%n%C'">
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-code"><xsl:with-param name="ascii" select="$ascii"/><xsl:with-param name="prefix" select="$postprefix"/></xsl:call-template>
            <xsl:call-template name="emit-postal-city"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="cityarea|sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:when test="$format='%A%n%C%n%Z'">
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-city"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-code"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="cityarea|sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:when test="$format='%A%n%D %C%n%S %Z'">
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-cityarea-city"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-region-code"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:when test="$format='%A%n%Z'">
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-code"><xsl:with-param name="ascii" select="$ascii"/><xsl:with-param name="prefix" select="$postprefix"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="city|cityarea|sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:when test="$format='%A%n%D%n%C %Z'">
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-cityarea"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-city-code"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:when test="$format='%A%n%D%n%Z %C, %S'">
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-cityarea"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-code-city-region"><xsl:with-param name="ascii" select="$ascii"/><xsl:with-param name="cr-delim" select="', '"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:when test="$format='%A%n%C%n%S%n%Z'">
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-city"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-region"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-code"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="cityarea|sortingcode"/></xsl:call-template>
          </xsl:when>
          <xsl:otherwise>
            <!-- %A%n%C, %S %Z -->
            <xsl:call-template name="emit-postal-street"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-city-comma-region-code"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-country"><xsl:with-param name="ascii" select="$ascii"/></xsl:call-template>
            <xsl:call-template name="emit-postal-warnings"><xsl:with-param name="nodes" select="cityarea|sortingcode"/></xsl:call-template>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:when>
      <xsl:otherwise>
        <xsl:if test="*[not(self::postalLine)]">
          <xsl:call-template name="error">
            <xsl:with-param name="msg">It is not allowed to mix postalLine with other elements; these will be ignored.</xsl:with-param>
          </xsl:call-template>
        </xsl:if>
        <xsl:for-each select="postalLine">
          <xsl:call-template name="emit-postal-line">
            <xsl:with-param name="value">
              <xsl:call-template name="extract-normalized">
                <xsl:with-param name="ascii" select="$ascii"/>
              </xsl:call-template>
            </xsl:with-param>
          </xsl:call-template>
        </xsl:for-each>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:for-each>
  <xsl:if test="phone">
    <xsl:variable name="phone">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="phone"/>
      </xsl:call-template>
    </xsl:variable>
    <xsl:call-template name="emit-postal-line">
      <xsl:with-param name="prefix">Phone</xsl:with-param>
      <xsl:with-param name="value" select="$phone"/>
      <xsl:with-param name="link" select="concat('tel:',translate($phone,' ',''))"/>
    </xsl:call-template>
  </xsl:if>
  <xsl:if test="facsimile">
    <xsl:variable name="facsimile">
      <xsl:call-template name="extract-normalized">
        <xsl:with-param name="node" select="facsimile"/>
      </xsl:call-template>
    </xsl:variable>
    <xsl:call-template name="emit-postal-line">
      <xsl:with-param name="prefix">Fax</xsl:with-param>
      <xsl:with-param name="value" select="$facsimile"/>
      <xsl:with-param name="link" select="concat('fax:',translate($facsimile,' ',''))"/>
    </xsl:call-template>
  </xsl:if>
  <xsl:if test="email">
    <xsl:call-template name="emit-postal-line">
      <xsl:with-param name="prefix">
        <xsl:choose>
          <xsl:when test="$xml2rfc-rfcedstyle='yes'">Email</xsl:when>
          <xsl:otherwise>EMail</xsl:otherwise>
        </xsl:choose>
      </xsl:with-param>
      <xsl:with-param name="values">
        <xsl:for-each select="email">
          <xsl:variable name="e">
            <xsl:call-template name="extract-email"/>
          </xsl:variable>
          <v>
            <xsl:if test="$xml2rfc-linkmailto!='no'">
              <xsl:attribute name="href">
                <xsl:value-of select="concat('mailto:',normalize-space($e))"/>
              </xsl:attribute>
            </xsl:if>
            <xsl:value-of select="normalize-space($e)"/>
          </v>
        </xsl:for-each>
      </xsl:with-param>
    </xsl:call-template>
  </xsl:if>
  <xsl:for-each select="uri">
    <xsl:variable name="uri">
      <xsl:call-template name="extract-uri"/>
    </xsl:variable>
    <xsl:call-template name="emit-postal-line">
      <xsl:with-param name="prefix">URI</xsl:with-param>
      <xsl:with-param name="value" select="$uri"/>
      <xsl:with-param name="link" select="$uri"/>
      <xsl:with-param name="annotation" select="@x:annotation"/>
    </xsl:call-template>
  </xsl:for-each>
</xsl:template>

<xsl:template name="emit-author">
  <xsl:param name="ascii" select="true()"/>
  <b>
    <xsl:choose>
      <xsl:when test="(not(@fullname) or @fullname='') and @surname!=''">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg">fullname attribute should be specified for author (using surname instead)</xsl:with-param>
        </xsl:call-template>
        <xsl:call-template name="format-initials"/>
        <xsl:text> </xsl:text>
        <xsl:value-of select="@surname"/>
      </xsl:when>
      <xsl:when test="@asciiFullname!='' and $ascii">
        <xsl:value-of select="@asciiFullname" />
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="@fullname" />
      </xsl:otherwise>
    </xsl:choose>
  </b>
  <xsl:if test="not(self::contact) and @role">
    <xsl:text> (</xsl:text>
    <xsl:value-of select="@role" />
    <xsl:text>)</xsl:text>
  </xsl:if>
  <!-- annotation support for Martin "uuml" Duerst -->
  <xsl:if test="@x:annotation">
    <xsl:text> </xsl:text>
    <i><xsl:value-of select="@x:annotation"/></i>
  </xsl:if>

  <xsl:if test="normalize-space(concat(organization,organization/@ascii)) != ''">
    <br/>
    <xsl:choose>
      <xsl:when test="organization/@ascii!='' and $ascii">
        <xsl:value-of select="organization/@ascii" />
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="organization" />
      </xsl:otherwise>
    </xsl:choose>
  </xsl:if>
  
  <xsl:call-template name="emit-author-details">
    <xsl:with-param name="ascii" select="$ascii"/>
  </xsl:call-template>  
</xsl:template>

<!-- this is a named template because <back> may be absent -->
<xsl:template name="back">
  <xsl:for-each select="back">
    <xsl:call-template name="check-no-text-content"/>
  </xsl:for-each>

  <!-- add editorial comments -->
  <xsl:if test="//cref[not(@display) or display!='false'] and $xml2rfc-comments='yes' and $xml2rfc-inline!='yes'">
    <xsl:call-template name="insertComments" />
  </xsl:if>

  <!-- next, add information about the document's authors -->
  <xsl:if test="$xml2rfc-ext-authors-section='before-appendices'">
    <xsl:call-template name="insertAuthors" />
  </xsl:if>

  <!-- add all other top-level sections under <back> -->
  <xsl:apply-templates select="back/*[not(self::references) and not(self::ed:replace and .//references)]" />

  <!-- insert the index if index entries exist -->
  <!-- note it always comes before the authors section -->
  <xsl:if test="$has-index">
    <xsl:call-template name="insertIndex" />
  </xsl:if>

  <!-- Authors section is the absolute last thing, except for copyright stuff -->
  <xsl:if test="$xml2rfc-ext-authors-section='end'">
    <xsl:call-template name="insertAuthors" />
  </xsl:if>

  <xsl:if test="$xml2rfc-private=''">
    <!-- copyright statements -->
    <xsl:variable name="copyright">
      <xsl:call-template name="insertCopyright" />
    </xsl:variable>

    <!-- emit it -->
    <xsl:choose>
      <xsl:when test="function-available('exslt:node-set')">
        <xsl:apply-templates select="exslt:node-set($copyright)" />
      </xsl:when>
      <xsl:otherwise>
        <xsl:call-template name="error">
          <xsl:with-param name="msg" select="$node-set-warning"/>
        </xsl:call-template>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:if>

</xsl:template>

<xsl:template name="check-absolute-uri">
  <xsl:variable name="potential-scheme" select="substring-before(@target,':')"/>
  <xsl:variable name="invalid-scheme-chars" select="translate($potential-scheme,concat($alnum,'+-.'),'')"/>
  <xsl:if test="$potential-scheme=''">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">target attribute not an absolute URI: <xsl:value-of select="@target"/></xsl:with-param>
    </xsl:call-template>
  </xsl:if>
  <xsl:if test="$potential-scheme!='' and $invalid-scheme-chars!=''">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">target attribute '<xsl:value-of select="@target"/>' contains invalid scheme name '<xsl:value-of select="$potential-scheme"/>'</xsl:with-param>
    </xsl:call-template>
  </xsl:if>
</xsl:template>

<xsl:template match="eref[*|text()]">
  <xsl:call-template name="check-absolute-uri"/>
  <a href="{@target}">
    <xsl:apply-templates/>
  </a>
</xsl:template>

<xsl:template match="eref[not(*|text())]">
  <xsl:call-template name="check-absolute-uri"/>
  <xsl:variable name="in-angles" select="(not(/rfc/@version >= 3) and not(@brackets='none')) or @brackets='angle'"/>
  <xsl:if test="$in-angles"><xsl:text>&lt;</xsl:text></xsl:if>
  <a href="{@target}"><xsl:value-of select="@target"/></a>
  <xsl:if test="$in-angles"><xsl:text>&gt;</xsl:text></xsl:if>
</xsl:template>

<xsl:template match="figure">
  <xsl:call-template name="check-no-text-content"/>
  <!-- warn about the attributes that we do not support -->
  <xsl:for-each select="@*[local-name()!='title' and local-name()!='suppress-title' and local-name()!='anchor' and local-name()!='pn' and normalize-space(.)!='']">
    <xsl:if test="local-name(.)!='align' or normalize-space(.)!='left'">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg" select="concat('unsupported attribute ',local-name(.),' on figure element')"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:for-each>
  <xsl:variable name="anch-container">
    <xsl:choose>
      <xsl:when test="ancestor::t">span</xsl:when>
      <xsl:otherwise>div</xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <xsl:if test="@anchor!=''">
    <xsl:call-template name="check-anchor"/>
    <xsl:element name="{$anch-container}">
      <xsl:attribute name="id"><xsl:value-of select="@anchor"/></xsl:attribute>
    </xsl:element>
  </xsl:if>
  <xsl:variable name="anch">
    <xsl:call-template name="get-figure-anchor"/>
  </xsl:variable>
  <xsl:element name="{$anch-container}">
    <xsl:attribute name="id"><xsl:value-of select="$anch"/></xsl:attribute>
    <xsl:apply-templates select="*[not(self::name)]"/>
  </xsl:element>
  <xsl:if test="(@title!='' or name) or (@anchor!='' and not(@suppress-title='true'))">
    <xsl:variable name="n"><xsl:call-template name="get-figure-number"/></xsl:variable>
    <p class="figure">
      <xsl:if test="not(starts-with($n,'u'))">
        <xsl:text>Figure </xsl:text>
        <xsl:value-of select="$n"/>
        <xsl:if test="@title!='' or name">: </xsl:if>
      </xsl:if>
      <xsl:call-template name="insertTitle"/>
    </p>
  </xsl:if>
</xsl:template>

<xsl:variable name="all-notes" select="/rfc/front/note"/>
<xsl:variable name="all-edited-notes" select="/rfc/front/ed:replace[.//note]"/>

<!-- TODO:extend for other streams -->
<xsl:variable name="stream-note-titles">[IESG Note][IESG Note:]</xsl:variable>

<xsl:variable name="notes-not-in-boilerplate" select="$all-notes[not(contains($stream-note-titles,concat('[',normalize-space(@title),']'))) or $xml2rfc-private!='' or $notes-follow-abstract]"/>
<xsl:variable name="edited-notes-not-in-boilerplate" select="$all-edited-notes[not(contains($stream-note-titles,concat('[',normalize-space(.//note/@title),']'))) or $xml2rfc-private!='' or $notes-follow-abstract]"/>
<xsl:variable name="notes-in-boilerplate" select="$all-notes[not(not(contains($stream-note-titles,concat('[',normalize-space(@title),']'))) or $xml2rfc-private!='' or $notes-follow-abstract)]"/>
<xsl:variable name="edited-notes-in-boilerplate" select="$all-edited-notes[not(not(contains($stream-note-titles,concat('[',normalize-space(.//note/@title),']'))) or $xml2rfc-private!='' or $notes-follow-abstract)]"/>

<xsl:template name="draft-sequence-number">
  <xsl:param name="name"/>
  <xsl:choose>
    <xsl:when test="contains($name,'-')">
      <xsl:call-template name="draft-sequence-number">
        <xsl:with-param name="name" select="substring-after($name,'-')"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="$name"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="draft-base-name">
  <xsl:param name="name"/>
  <xsl:variable name="seq">
    <xsl:call-template name="draft-sequence-number">
      <xsl:with-param name="name" select="$name"/>
    </xsl:call-template>
  </xsl:variable>
  <xsl:value-of select="substring($name,1,string-length($name)-string-length($seq)-1)"/>
</xsl:template>

<xsl:template name="draft-name-legal">
  <xsl:param name="name"/>

  <xsl:if test="contains($name,'.')">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">The Internet-Draft name '<xsl:value-of select="$name"/>' should contain the base name, not the filename (thus no file extension).</xsl:with-param>
    </xsl:call-template>
  </xsl:if>

  <xsl:variable name="offending" select="translate($name,concat($lcase,$digits,'-.'),'')"/>
  <xsl:if test="$offending != ''">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">The Internet-Draft name  '<xsl:value-of select="$name"/>' should not contain the character '<xsl:value-of select="substring($offending,1,1)"/>'.</xsl:with-param>
    </xsl:call-template>
  </xsl:if>

  <xsl:if test="contains($name,'--')">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">The Internet-Draft name '<xsl:value-of select="$name"/>' should not contain the character sequence '--'.</xsl:with-param>
    </xsl:call-template>
  </xsl:if>

  <xsl:if test="not(starts-with($name,'draft-'))">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">The Internet-Draft name '<xsl:value-of select="$name"/>' should start with 'draft-'.</xsl:with-param>
    </xsl:call-template>
  </xsl:if>

  <xsl:variable name="seq">
    <xsl:call-template name="draft-sequence-number">
      <xsl:with-param name="name" select="$name"/>
    </xsl:call-template>
  </xsl:variable>

  <xsl:if test="$seq='' or ($seq!='latest' and translate($seq,$digits,'')!='')">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">The Internet-Draft name '<xsl:value-of select="$name"/>' should end with a two-digit sequence number or 'latest'.</xsl:with-param>
    </xsl:call-template>
  </xsl:if>

    <xsl:if test="string-length($name)-string-length($seq) > 50">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">The Internet-Draft name '<xsl:value-of select="$name"/>', excluding sequence number, should have less than 50 characters.</xsl:with-param>
      </xsl:call-template>
    </xsl:if>

</xsl:template>


<xsl:template match="front">
  <xsl:call-template name="check-no-text-content"/>
  <header>
    <xsl:if test="$xml2rfc-topblock!='no'">
      <!-- collect information for left column -->
      <xsl:variable name="leftColumn">
        <xsl:call-template name="collectLeftHeaderColumn" />
      </xsl:variable>
      <!-- collect information for right column -->
      <xsl:variable name="rightColumn">
        <xsl:call-template name="collectRightHeaderColumn" />
      </xsl:variable>
      <!-- insert the collected information -->
      <table class="{$css-header}" id="{$anchor-pref}headerblock">
        <xsl:choose>
          <xsl:when test="function-available('exslt:node-set')">
            <xsl:call-template name="emitheader">
              <xsl:with-param name="lc" select="exslt:node-set($leftColumn)" />
              <xsl:with-param name="rc" select="exslt:node-set($rightColumn)" />
            </xsl:call-template>
          </xsl:when>
          <xsl:otherwise>
            <xsl:call-template name="error">
              <xsl:with-param name="msg" select="$node-set-warning"/>
            </xsl:call-template>
          </xsl:otherwise>
        </xsl:choose>
      </table>
    </xsl:if>

    <div id="{$anchor-pref}title">
      <!-- main title -->
      <h1><xsl:apply-templates select="title"/></h1>
      <xsl:if test="/rfc/@docName">
        <xsl:variable name="docname" select="/rfc/@docName"/>
        <xsl:choose>
          <xsl:when test="$rfcno!=''">
            <xsl:call-template name="info">
              <xsl:with-param name="msg">The @docName attribute '<xsl:value-of select="$docname"/>' is ignored because an RFC number (<xsl:value-of select="$rfcno"/>) is specified as well.</xsl:with-param>
            </xsl:call-template>
          </xsl:when>
          <xsl:otherwise>
            <div class="filename">
              <xsl:variable name="seq">
                <xsl:call-template name="draft-sequence-number">
                  <xsl:with-param name="name" select="$docname"/>
                </xsl:call-template>
              </xsl:variable>
              <xsl:variable name="base">
                <xsl:call-template name="draft-base-name">
                  <xsl:with-param name="name" select="$docname"/>
                </xsl:call-template>
              </xsl:variable>
              <xsl:variable name="status-uri">
                <xsl:call-template name="compute-draft-status-uri">
                  <xsl:with-param name="draftname" select="$base"/>
                </xsl:call-template>
              </xsl:variable>
              <xsl:choose>
                <xsl:when test="number($seq)>=0">
                  <xsl:variable name="draft-uri">
                    <xsl:call-template name="compute-internet-draft-uri">
                      <xsl:with-param name="internet-draft" select="$docname"/>
                    </xsl:call-template>
                  </xsl:variable>
                  <a href="{$status-uri}" class="smpl"><xsl:value-of select="$base"/></a>
                  <xsl:text>-</xsl:text>
                  <a href="{$draft-uri}" class="smpl"><xsl:value-of select="$seq"/></a>
                </xsl:when>
                <xsl:when test="$base!=''">
                  <a href="{$status-uri}" class="smpl"><xsl:value-of select="$docname"/></a>
                </xsl:when>
                <xsl:otherwise>
                  <xsl:value-of select="$docname"/>
                </xsl:otherwise>
              </xsl:choose>
            </div>
          </xsl:otherwise>
        </xsl:choose>
        
        <xsl:variable name="si" select="/rfc/front/seriesInfo[@name='Internet-Draft']"/>
        <xsl:if test="$si and $si/@value!=$docname">
          <xsl:call-template name="error">
            <xsl:with-param name="msg">Inconsistent draft names in /rfc/@docName ('<xsl:value-of select="$docname"/>') and /rfc/seriesInfo ('<xsl:value-of select="$si/@value"/>').</xsl:with-param>
          </xsl:call-template>
        </xsl:if>

        <xsl:call-template name="draft-name-legal">
          <xsl:with-param name="name" select="$docname"/>
        </xsl:call-template>
      </xsl:if>
    </div>
  </header>

  <!-- insert notice about update -->
  <xsl:if test="$published-as-rfc">
    <p class="{$css-publishedasrfc}">
      <b>Note:</b> a later version of this document has been published as <a href="{$published-as-rfc/@href}"><xsl:value-of select="$published-as-rfc/@title"/></a>.
    </p>
  </xsl:if>

  <!-- check for conforming ipr attribute -->
  <xsl:choose>
    <xsl:when test="not(/rfc/@ipr)">
      <xsl:if test="not($is-rfc) and $xml2rfc-private=''">
        <xsl:call-template name="error">
          <xsl:with-param name="msg">Either /rfc/@ipr or /rfc/@number is required</xsl:with-param>
        </xsl:call-template>
      </xsl:if>
    </xsl:when>
    <xsl:when test="/rfc/@ipr = 'full2026'" />
    <xsl:when test="/rfc/@ipr = 'noDerivativeWorks'" />
    <xsl:when test="/rfc/@ipr = 'noDerivativeWorksNow'" />
    <xsl:when test="/rfc/@ipr = 'none'" />
    <xsl:when test="/rfc/@ipr = 'full3667'" />
    <xsl:when test="/rfc/@ipr = 'noModification3667'" />
    <xsl:when test="/rfc/@ipr = 'noDerivatives3667'" />
    <xsl:when test="/rfc/@ipr = 'full3978'" />
    <xsl:when test="/rfc/@ipr = 'noModification3978'" />
    <xsl:when test="/rfc/@ipr = 'noDerivatives3978'" />
    <xsl:when test="/rfc/@ipr = 'trust200811'" />
    <xsl:when test="/rfc/@ipr = 'noModificationTrust200811'" />
    <xsl:when test="/rfc/@ipr = 'noDerivativesTrust200811'" />
    <xsl:when test="/rfc/@ipr = 'trust200902'" />
    <xsl:when test="/rfc/@ipr = 'noModificationTrust200902'" />
    <xsl:when test="/rfc/@ipr = 'noDerivativesTrust200902'" />
    <xsl:when test="/rfc/@ipr = 'pre5378Trust200902'" />
    <xsl:otherwise>
      <xsl:call-template name="error">
        <xsl:with-param name="msg" select="concat('Unknown value for /rfc/@ipr: ', /rfc/@ipr)"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>

  <xsl:call-template name="insert-errata">
    <xsl:with-param name="section" select="'boilerplate'"/>
  </xsl:call-template>

  <xsl:if test="not($abstract-first)">
    <xsl:if test="$xml2rfc-private=''">
      <xsl:call-template name="emit-ietf-preamble">
        <xsl:with-param name="notes" select="$notes-in-boilerplate|$edited-notes-in-boilerplate"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:if>

  <xsl:apply-templates select="abstract"/>

  <xsl:if test="$notes-follow-abstract">
    <xsl:apply-templates select="$notes-not-in-boilerplate|$edited-notes-not-in-boilerplate" />
  </xsl:if>

  <xsl:if test="$abstract-first">
    <xsl:if test="$xml2rfc-private=''">
      <xsl:call-template name="emit-ietf-preamble">
        <xsl:with-param name="notes" select="$notes-in-boilerplate|$edited-notes-in-boilerplate"/>
      </xsl:call-template>
    </xsl:if>
  </xsl:if>

  <xsl:if test="not($notes-follow-abstract)">
    <xsl:apply-templates select="$notes-not-in-boilerplate|$edited-notes-not-in-boilerplate" />
  </xsl:if>

  <xsl:if test="$xml2rfc-toc='yes'">
    <xsl:apply-templates select="/" mode="toc" />
  </xsl:if>

</xsl:template>

<xsl:template name="string-diff">
  <xsl:param name="s1"/>
  <xsl:param name="s2"/>
  <xsl:param name="p"/>

  <xsl:choose>
    <xsl:when test="$s1='' and $s2=''"><!-- done --></xsl:when>
    <xsl:when test="$s1=''">
      <xsl:value-of select="concat('Extra characters at the end of 1st string: ',$s1)"/>
    </xsl:when>
    <xsl:when test="$s2=''">
      <xsl:value-of select="concat('Extra characters at the end of 2sn string: ',$s2)"/>
    </xsl:when>
    <xsl:when test="substring($s1,1,1)!=substring($s2,1,1)">
      <xsl:value-of select="concat('Strings differ at position ',string-length($p),', 1st string ends in: [[[',$s1,']]], 2nd string ends in: [[[',$s2,']]]')"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="string-diff">
        <xsl:with-param name="s1" select="substring($s1,2)"/>
        <xsl:with-param name="s2" select="substring($s2,2)"/>
        <xsl:with-param name="p" select="concat($p,substring($s1,1,1))"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>


<xsl:template name="emit-ietf-preamble">
  <xsl:param name="notes"/>

  <!-- Get status info formatted as per RFC2629-->
  <xsl:variable name="preamble">
    <xsl:for-each select="/rfc">
      <xsl:call-template name="insertPreamble">
        <xsl:with-param name="notes" select="$notes"/>
      </xsl:call-template>
    </xsl:for-each>
  </xsl:variable>

  <!-- emit it -->
  <xsl:choose>
    <xsl:when test="function-available('exslt:node-set')">
      <!-- get document-supplied boilerplate -->
      <xsl:variable name="userboiler">
        <xsl:apply-templates select="$src//rfc/front/boilerplate"/>
      </xsl:variable>
      <xsl:variable name="generated">
         <xsl:apply-templates select="exslt:node-set($preamble)"/>
      </xsl:variable>
      <xsl:copy-of select="$generated"/>
      <!--<xsl:message>1: [[[<xsl:value-of select="normalize-space(string($userboiler))"/>]]]</xsl:message>
      <xsl:message>2: [[[<xsl:value-of select="normalize-space(string($generated))"/>]]]</xsl:message>-->
      <xsl:variable name="differ" select="$src//rfc/front/boilerplate and normalize-space(string($userboiler))!=normalize-space(string($generated))"/>
      <xsl:if test="$differ">
        <xsl:variable name="diff">
          <xsl:call-template name="string-diff">
            <xsl:with-param name="s1" select="normalize-space(string($userboiler))"/>
            <xsl:with-param name="s2" select="normalize-space(string($generated))"/>
          </xsl:call-template>
        </xsl:variable>
        <xsl:call-template name="error">
          <xsl:with-param name="msg" select="concat('User-supplied boilerplate differs from auto-generated boilerplate (inserting auto-generated); ', $diff)"/>
        </xsl:call-template>
      </xsl:if>
    </xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="error">
        <xsl:with-param name="msg" select="$node-set-warning"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template match="iref">
  <xsl:variable name="anchor"><xsl:call-template name="compute-iref-anchor"/></xsl:variable>
  <xsl:choose>
    <xsl:when test="parent::figure">
      <div id="{$anchor}"/>
    </xsl:when>
    <xsl:when test="ancestor::t or ancestor::artwork or ancestor::sourcecode or ancestor::preamble or ancestor::postamble">
      <span id="{$anchor}"/>
    </xsl:when>
    <xsl:otherwise>
      <div id="{$anchor}"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="compute-iref-anchor">
  <xsl:variable name="first" select="translate(substring(@item,1,1),$ucase,$lcase)"/>
  <xsl:variable name="nkey" select="translate($first,$alnum,'')"/>
  <xsl:choose>
    <xsl:when test="count(.|$section-level-irefs)=count($section-level-irefs)">
      <xsl:for-each select="..">
        <xsl:value-of select="$anchor-pref"/>section.<xsl:call-template name="get-section-number"/>
      </xsl:for-each>
    </xsl:when>
    <xsl:when test="$nkey=''">
      <xsl:value-of select="$anchor-pref"/>iref.<xsl:value-of select="$first"/>.<xsl:number level="any" count="iref[starts-with(translate(@item,$ucase,$lcase),$first) and count(.|$section-level-irefs)!=count($section-level-irefs)]"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="$anchor-pref"/>iref.<xsl:number level="any" count="iref[translate(substring(@item,1,1),$alnum,'')!='' and count(.|$section-level-irefs)!=count($section-level-irefs)]"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="compute-extref-anchor">
  <xsl:variable name="first" select="translate(substring(.,1,1),$ucase,$lcase)"/>
  <xsl:variable name="nkey" select="translate($first,$lcase,'')"/>
  <xsl:choose>
    <xsl:when test="$nkey=''">
      <xsl:value-of select="$anchor-pref"/>extref.<xsl:value-of select="$first"/>.<xsl:number level="any" count="x:ref[starts-with(translate(.,$ucase,$lcase),$first)]"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="$anchor-pref"/>extref.<xsl:number level="any" count="x:ref[translate(substring(.,1,1),concat($lcase,$ucase),'')='']"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<!-- list templates depend on the list style -->

<xsl:template name="list-empty">
  <ul class="empty">
    <xsl:call-template name="copy-anchor"/>
    <xsl:call-template name="insertInsDelClass"/>
    <xsl:apply-templates />
  </ul>
</xsl:template>

<xsl:template name="list-format">
  <dl>
    <xsl:call-template name="copy-anchor"/>
    <xsl:call-template name="insertInsDelClass"/>
    <xsl:apply-templates />
  </dl>
</xsl:template>

<xsl:template name="list-hanging">
  <xsl:variable name="compact">
    <xsl:call-template name="get-compact-setting"/>
  </xsl:variable>
  <!-- insert a hard space for nested lists so that indentation works ok -->
  <xsl:if test="ancestor::list and normalize-space(preceding-sibling::text())=''">
    <xsl:text>&#160;</xsl:text>
  </xsl:if>
  <dl>
    <xsl:if test="$compact='yes'">
      <xsl:attribute name="class">compact</xsl:attribute>
    </xsl:if>
    <xsl:call-template name="copy-anchor"/>
    <xsl:call-template name="insertInsDelClass"/>
    <xsl:apply-templates />
  </dl>
</xsl:template>

<xsl:template name="list-numbers">
  <ol>
    <xsl:call-template name="copy-anchor"/>
    <xsl:call-template name="insertInsDelClass"/>
    <xsl:apply-templates />
  </ol>
</xsl:template>

<xsl:template name="check-no-hangindent">
  <xsl:if test="@hangIndent">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg" select="'hangIndent attribute not supported for this list style'"/>
    </xsl:call-template>
  </xsl:if>
</xsl:template>

<xsl:template name="list-letters">
  <xsl:variable name="type">
    <xsl:choose>
      <!-- lowercase for even-numbered nesting levels -->
      <xsl:when test="0=(count(ancestor::list[@style='letters']) mod 2)">a</xsl:when>
      <!-- uppercase otherwise -->
      <xsl:otherwise>A</xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <ol type="{$type}">
    <xsl:call-template name="copy-anchor"/>
    <xsl:call-template name="insertInsDelClass"/>
    <xsl:apply-templates />
  </ol>
</xsl:template>

<xsl:template name="list-symbols">
  <ul>
    <xsl:call-template name="copy-anchor"/>
    <xsl:call-template name="insertInsDelClass"/>
    <xsl:apply-templates />
  </ul>
</xsl:template>

<xsl:template match="list">
  <xsl:variable name="style" select="ancestor-or-self::list[@style][1]/@style"/>
  <xsl:call-template name="check-no-text-content"/>
  <xsl:choose>
    <xsl:when test="not($style) or $style='empty'">
      <xsl:call-template name="check-no-hangindent"/>
      <xsl:call-template name="list-empty"/>
    </xsl:when>
    <xsl:when test="starts-with($style, 'format ')">
      <xsl:call-template name="list-format"/>
    </xsl:when>
    <xsl:when test="$style='hanging'">
      <xsl:call-template name="list-hanging"/>
    </xsl:when>
    <xsl:when test="$style='letters'">
      <xsl:call-template name="check-no-hangindent"/>
      <xsl:call-template name="list-letters"/>
    </xsl:when>
    <xsl:when test="$style='numbers'">
      <xsl:call-template name="check-no-hangindent"/>
      <xsl:call-template name="list-numbers"/>
    </xsl:when>
    <xsl:when test="$style='symbols'">
      <xsl:call-template name="check-no-hangindent"/>
      <xsl:call-template name="list-symbols"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="error">
        <xsl:with-param name="msg" select="concat('Unsupported style attribute: ', $style)"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>



<!-- v3 lists -->

<xsl:template match="ol[string-length(@type)>1]">
  <xsl:variable name="start">
    <xsl:choose>
      <xsl:when test="@group">
        <xsl:call-template name="ol-start">
          <xsl:with-param name="node" select="."/>
        </xsl:call-template>
      </xsl:when>
      <xsl:when test="@start">
        <xsl:value-of select="@start"/>
      </xsl:when>
      <xsl:otherwise>1</xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <div>
    <xsl:call-template name="attach-paragraph-number-as-id"/>
    <dl>
      <xsl:call-template name="copy-anchor"/>
      <xsl:for-each select="li">
        <xsl:variable name="label">
          <xsl:call-template name="expand-format-percent">
            <xsl:with-param name="format" select="../@type"/>
            <xsl:with-param name="pos" select="$start - 1 + position()"/>
          </xsl:call-template>
        </xsl:variable>
        <dt>
          <xsl:call-template name="copy-anchor"/>
          <xsl:value-of select="$label"/>
        </dt>
        <dd>
          <xsl:apply-templates/>
        </dd>
      </xsl:for-each>
    </dl>
  </div>
</xsl:template>

<xsl:template match="dl">
  <xsl:variable name="newl" select="@newline"/>
  <xsl:variable name="spac" select="@spacing"/>
  <xsl:variable name="class">
    <xsl:if test="$spac='compact'">compact </xsl:if>
    <xsl:if test="$newl='true'">nohang </xsl:if>
  </xsl:variable>
  <div>
    <xsl:if test="not(ancestor::list)">
      <xsl:call-template name="attach-paragraph-number-as-id"/>
    </xsl:if>
    <dl>
      <xsl:call-template name="copy-anchor"/>
      <xsl:if test="normalize-space($class)!=''">
        <xsl:attribute name="class"><xsl:value-of select="normalize-space($class)"/></xsl:attribute>
      </xsl:if>
      <xsl:for-each select="dt">
        <xsl:apply-templates select="."/>
        <xsl:apply-templates select="following-sibling::dd[1]"/>
      </xsl:for-each>
    </dl>
  </div>
</xsl:template>

<xsl:template match="dt">
  <dt>
    <xsl:call-template name="copy-anchor"/>
    <xsl:apply-templates/>
  </dt>
</xsl:template>

<xsl:template match="dd">
  <dd>
    <xsl:call-template name="copy-anchor"/>
    <xsl:variable name="indent" select="../@indent"/>
    <xsl:if test="number($indent)=$indent">
      <xsl:attribute name="style">margin-left: <xsl:value-of select="$indent div 2"/>em</xsl:attribute>
    </xsl:if>
    <xsl:variable name="block-level-children" select="artwork|aside|dl|figure|ol|sourcecode|t|table|ul"/>
    <xsl:choose>
      <xsl:when test="$block-level-children">
        <!-- TODO: improve error handling-->
        <xsl:for-each select="$block-level-children">
          <xsl:choose>
            <xsl:when test="self::t">
              <p>
                <xsl:call-template name="copy-anchor"/>
                <xsl:apply-templates/>
              </p>
            </xsl:when>
            <xsl:otherwise>
              <xsl:apply-templates select="."/>
            </xsl:otherwise>
          </xsl:choose>
        </xsl:for-each>
      </xsl:when>
      <xsl:otherwise>
        <xsl:apply-templates/>
      </xsl:otherwise>
    </xsl:choose>
    <!-- add one nbsp for empty dd elements -->
    <xsl:if test="normalize-space(.)=''">&#160;</xsl:if>
  </dd>
</xsl:template>

<!-- get value of "compact" mode, checking subcompact first, then compact -->
<xsl:template name="get-compact-setting">
  <xsl:variable name="t1">
    <xsl:call-template name="parse-pis">
      <xsl:with-param name="nodes" select="preceding::processing-instruction('rfc')"/>
      <xsl:with-param name="attr" select="'subcompact'"/>
      <xsl:with-param name="default" select="'?'"/>
      <xsl:with-param name="duplicate-warning" select="'no'"/>
    </xsl:call-template>
  </xsl:variable>
  <xsl:choose>
    <xsl:when test="$t1='?'">
      <xsl:call-template name="parse-pis">
        <xsl:with-param name="nodes" select="preceding::processing-instruction('rfc')"/>
        <xsl:with-param name="attr" select="'compact'"/>
        <xsl:with-param name="default" select="'?'"/>
        <xsl:with-param name="duplicate-warning" select="'no'"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="$t1"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="ol-start">
  <xsl:param name="node"/>
  <xsl:variable name="group" select="$node/@group"/>
  <xsl:variable name="prec" select="$node/preceding::ol[@group=$group]"/>
  <xsl:choose>
    <xsl:when test="$node/@start">
      <xsl:value-of select="$node/@start"/>
    </xsl:when>
    <xsl:when test="$prec">
      <xsl:variable name="s">
        <xsl:call-template name="ol-start">
          <xsl:with-param name="node" select="$prec[last()]"/>
        </xsl:call-template>
      </xsl:variable>
      <xsl:value-of select="$s + count($prec[last()]/li)"/>
    </xsl:when>
    <xsl:otherwise>1</xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template match="ol[not(@type) or string-length(@type)=1]">
  <xsl:call-template name="check-no-text-content"/>

  <xsl:variable name="start">
    <xsl:choose>
      <xsl:when test="@group">
        <xsl:call-template name="ol-start">
          <xsl:with-param name="node" select="."/>
        </xsl:call-template>
      </xsl:when>
      <xsl:when test="@start">
        <xsl:value-of select="@start"/>
      </xsl:when>
      <xsl:otherwise/>
    </xsl:choose>
  </xsl:variable>
  <div>
    <xsl:if test="not(ancestor::list)">
      <xsl:call-template name="attach-paragraph-number-as-id"/>
    </xsl:if>
    <ol>
      <xsl:if test="$start!=''">
        <xsl:attribute name="start"><xsl:value-of select="$start"/></xsl:attribute>
      </xsl:if>
      <xsl:call-template name="copy-anchor"/>
      <xsl:call-template name="insertInsDelClass"/>
      <xsl:copy-of select="@type"/>
      <xsl:apply-templates />
    </ol>
  </div> 
</xsl:template>

<xsl:template match="ul">
  <div>
    <xsl:call-template name="insertInsDelClass"/>
    <xsl:if test="not(ancestor::list)">
      <xsl:call-template name="attach-paragraph-number-as-id"/>
    </xsl:if>
    <xsl:choose>
      <xsl:when test="not(li) and @x:when-empty">
        <p>
          <xsl:call-template name="copy-anchor"/>
          <xsl:value-of select="@x:when-empty"/>
        </p>
      </xsl:when>
      <xsl:otherwise>
        <ul>
          <xsl:call-template name="copy-anchor"/>
          <xsl:if test="@empty='true'">
            <xsl:attribute name="class">
              <xsl:text>empty</xsl:text>
              <xsl:if test="@bare='true'">
                <xsl:text> bare</xsl:text>
                <xsl:call-template name="warning">
                  <xsl:with-param name="msg">support for "bare" is experimental, see https://trac.tools.ietf.org/tools/xml2rfc/trac/ticket/547 for more information</xsl:with-param>
                </xsl:call-template>
              </xsl:if>
              <xsl:if test="@bare and @bare!='true'">
                <xsl:call-template name="error">
                  <xsl:with-param name="msg">the only valid value for "bare" is "true"</xsl:with-param>
                </xsl:call-template>
              </xsl:if>
            </xsl:attribute>
          </xsl:if>
          <xsl:if test="@bare and not(@empty='true')">
            <xsl:call-template name="error">
              <xsl:with-param name="msg">"bare" attribute is ignored when "empty" is not "true"</xsl:with-param>
            </xsl:call-template>
          </xsl:if>
          <xsl:apply-templates />
        </ul>
      </xsl:otherwise>
    </xsl:choose>
  </div>
</xsl:template>

<xsl:template match="li">
  <li>
    <xsl:call-template name="copy-anchor"/>
    <xsl:if test="(parent::ol or parent::ul) and ../@indent and number(../@indent)&gt;4">
      <xsl:attribute name="style">padding-left: <xsl:value-of select="(../@indent div 2) - 2"/>em</xsl:attribute>
    </xsl:if>
    <xsl:choose>
      <xsl:when test="artset|artwork|blockquote|dl|figure|ol|sourcecode|t|ul">
        <xsl:choose>
          <xsl:when test="bcp14|cref|em|eref|iref|relref|strong|sub|sup|tt|xref|text()[normalize-space(.)!='']">
            <xsl:call-template name="error">
              <xsl:with-param name="msg">unexpected content in &lt;li&gt;: can not mix block-level and phrase-level elements</xsl:with-param>
            </xsl:call-template>
          </xsl:when>
          <xsl:otherwise>
            <xsl:apply-templates/>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:when>
      <xsl:when test="bcp14|cref|em|eref|iref|relref|strong|sub|sup|tt|xref|text()[normalize-space(.)!='']">
        <xsl:choose>
          <xsl:when test="artset|artwork|blockquote|dl|figure|ol|sourcecode|t|ul">
            <xsl:call-template name="error">
              <xsl:with-param name="msg">unexpected content in &lt;li&gt;: can not mix phrase-level and block-level elements</xsl:with-param>
            </xsl:call-template>
          </xsl:when>
          <xsl:otherwise>
            <xsl:apply-templates/>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:when>
      <xsl:otherwise>
        <xsl:call-template name="error">
          <xsl:with-param name="msg">unexpected content in &lt;li&gt;</xsl:with-param>
        </xsl:call-template>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:if test="not(following-sibling::li)">
      <xsl:variable name="l">
        <xsl:for-each select="..">
          <xsl:call-template name="get-paragraph-number"/>
        </xsl:for-each>
      </xsl:variable>
      <xsl:if test="xml2rfc-ext-paragraph-links='yes' and $l!=''">
        <a class='self' href='#{$anchor-pref}section.{$l}'>&#xb6;</a>
      </xsl:if>
    </xsl:if>
  </li>
</xsl:template>

<!-- same for t(ext) elements -->

<xsl:template name="list-item-generic">
  <li>
    <xsl:call-template name="copy-anchor"/>
    <xsl:call-template name="insertInsDelClass"/>
    <xsl:for-each select="../..">
      <xsl:call-template name="insert-issue-pointer"/>
    </xsl:for-each>
    <xsl:apply-templates />
  </li>
</xsl:template>

<xsl:template name="list-item-hanging">
  <xsl:if test="@hangText!=''">
    <dt>
      <xsl:call-template name="copy-anchor"/>
      <xsl:call-template name="insertInsDelClass"/>
      <xsl:if test="count(preceding-sibling::t)=0">
        <xsl:variable name="del-node" select="ancestor::ed:del"/>
        <xsl:variable name="rep-node" select="ancestor::ed:replace"/>
        <xsl:variable name="deleted" select="$del-node and ($rep-node/ed:ins)"/>
        <xsl:for-each select="../..">
          <xsl:call-template name="insert-issue-pointer">
            <xsl:with-param name="deleted-anchor" select="$deleted"/>
          </xsl:call-template>
        </xsl:for-each>
      </xsl:if>
      <xsl:value-of select="@hangText" />
    </dt>
  </xsl:if>

  <xsl:variable name="dd-content">
    <xsl:apply-templates/>
  </xsl:variable>

  <xsl:choose>
    <xsl:when test="$dd-content!=''">
      <dd>
        <xsl:call-template name="insertInsDelClass"/>
        <!-- if hangIndent present, use 0.7 of the specified value (1em is the width of the "m" character -->
        <xsl:if test="../@hangIndent">
          <xsl:attribute name="style">margin-left: <xsl:value-of select="format-number(../@hangIndent * 0.7,'#.#')"/>em</xsl:attribute>
        </xsl:if>
        <xsl:apply-templates />
      </dd>
    </xsl:when>
    <xsl:otherwise>
      <dd>&#160;</dd>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="list-item-format">
  <xsl:variable name="list" select=".." />
  <xsl:variable name="format" select="substring-after(../@style,'format ')"/>
  <xsl:variable name="pos">
    <xsl:choose>
      <xsl:when test="$list/@counter">
        <xsl:number level="any" count="list[@counter=$list/@counter]/t"/>
      </xsl:when>
      <xsl:otherwise><xsl:value-of select="1 + count(preceding-sibling::t)"/></xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <dt>
    <xsl:call-template name="copy-anchor"/>
    <xsl:call-template name="expand-format-percent">
      <xsl:with-param name="format" select="$format"/>
      <xsl:with-param name="pos" select="$pos"/>
    </xsl:call-template>
  </dt>
  <dd>
    <xsl:apply-templates/>
  </dd>
</xsl:template>

<xsl:template match="list/t | list/ed:replace/ed:*/t">
  <xsl:variable name="style" select="ancestor::list[@style][1]/@style"/>
  <xsl:choose>
    <xsl:when test="not($style) or $style='empty' or $style='letters' or $style='numbers' or $style='symbols'">
      <xsl:if test="@hangText">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg" select="'t/@hangText used on unstyled list'"/>
        </xsl:call-template>
      </xsl:if>
      <xsl:call-template name="list-item-generic"/>
    </xsl:when>
    <xsl:when test="starts-with($style, 'format ')">
      <xsl:call-template name="list-item-format"/>
    </xsl:when>
    <xsl:when test="$style='hanging'">
      <xsl:call-template name="list-item-hanging"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="error">
        <xsl:with-param name="msg" select="concat('Unsupported style attribute: ', $style)"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="list-lt-generic">
  <li>
    <xsl:call-template name="copy-anchor"/>
    <xsl:apply-templates select="t" />
  </li>
</xsl:template>

<xsl:template name="list-lt-format">
  <xsl:variable name="list" select=".." />
  <xsl:variable name="format" select="substring-after(../@style,'format ')" />
  <xsl:variable name="pos">
    <xsl:choose>
      <xsl:when test="$list/@counter">
        <xsl:number level="any" count="list[@counter=$list/@counter]/*" />
      </xsl:when>
      <xsl:otherwise><xsl:value-of select="position()"/></xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <dt>
    <xsl:call-template name="copy-anchor"/>
    <xsl:call-template name="expand-format-percent">
      <xsl:with-param name="format" select="$format"/>
      <xsl:with-param name="pos" select="$pos"/>
    </xsl:call-template>
  </dt>
  <dd>
    <xsl:apply-templates select="t" />
  </dd>
</xsl:template>

<xsl:template name="list-lt-hanging">
  <xsl:if test="@hangText!=''">
    <dt>
      <xsl:call-template name="copy-anchor"/>
      <xsl:call-template name="insertInsDelClass"/>
      <xsl:variable name="del-node" select="ancestor::ed:del"/>
      <xsl:variable name="rep-node" select="ancestor::ed:replace"/>
      <xsl:variable name="deleted" select="$del-node and ($rep-node/ed:ins)"/>
      <xsl:for-each select="../..">
        <xsl:call-template name="insert-issue-pointer">
          <xsl:with-param name="deleted-anchor" select="$deleted"/>
        </xsl:call-template>
      </xsl:for-each>
      <xsl:value-of select="@hangText" />
    </dt>
  </xsl:if>
  <dd>
    <xsl:call-template name="insertInsDelClass"/>
    <!-- if hangIndent present, use 0.7 of the specified value (1em is the width of the "m" character -->
    <xsl:if test="../@hangIndent">
      <xsl:attribute name="style">margin-left: <xsl:value-of select="format-number(../@hangIndent * 0.7,'#.#')"/>em</xsl:attribute>
    </xsl:if>
    <xsl:apply-templates select="t" />
  </dd>
</xsl:template>

<xsl:template match="list/x:lt">
  <xsl:variable name="style" select="ancestor::list[@style][1]/@style"/>
  <xsl:choose>
    <xsl:when test="$style='letters' or $style='numbers' or $style='symbols'">
      <xsl:call-template name="list-lt-generic"/>
    </xsl:when>    
    <xsl:when test="starts-with($style, 'format ')">
      <xsl:call-template name="list-lt-format"/>
    </xsl:when>    
    <xsl:when test="$style='hanging'">
      <xsl:call-template name="list-lt-hanging"/>
    </xsl:when>    
    <xsl:otherwise>
      <xsl:call-template name="error">
        <xsl:with-param name="msg" select="concat('Unsupported style attribute: ', $style)"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="expand-format-percent">
  <xsl:param name="format"/>
  <xsl:param name="pos"/>
  
  <xsl:choose>
    <xsl:when test="$format=''"><!-- done--></xsl:when>
    <xsl:when test="substring($format,1,1)!='%' or string-length($format)=1">
      <xsl:value-of select="substring($format,1,1)"/>
      <xsl:call-template name="expand-format-percent">
        <xsl:with-param name="format" select="substring($format,2)"/>
        <xsl:with-param name="pos" select="$pos"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:variable name="f" select="substring($format,2,1)"/>
      <xsl:choose>
        <xsl:when test="$f='%'">%</xsl:when>
        <xsl:when test="$f='c'"><xsl:number value="$pos" format="a"/></xsl:when>
        <xsl:when test="$f='C'"><xsl:number value="$pos" format="A"/></xsl:when>
        <xsl:when test="$f='d'"><xsl:number value="$pos"/></xsl:when>
        <xsl:when test="$f='i'"><xsl:number value="$pos" format="i"/></xsl:when>
        <xsl:when test="$f='I'"><xsl:number value="$pos" format="I"/></xsl:when>
        <xsl:otherwise>
          <xsl:call-template name="error">
            <xsl:with-param name="msg" select="concat('Unsupported % format: ', $f)"/>
            <xsl:with-param name="inline" select="'no'"/>
          </xsl:call-template>
        </xsl:otherwise>
      </xsl:choose>
      <xsl:call-template name="expand-format-percent">
        <xsl:with-param name="format" select="substring($format,3)"/>
        <xsl:with-param name="pos" select="$pos"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
  
</xsl:template>

<xsl:template match="middle">
  <xsl:call-template name="check-no-text-content"/>
  <xsl:apply-templates />
  <xsl:apply-templates select="../back//references"/>
</xsl:template>

<xsl:template match="note">
  <xsl:call-template name="check-no-text-content"/>
  <xsl:variable name="classes">
    <xsl:text>note</xsl:text>
    <xsl:text> </xsl:text>
    <xsl:if test="@removeInRFC='true'">rfcEditorRemove</xsl:if>
  </xsl:variable>
  <xsl:variable name="num"><xsl:number/></xsl:variable>
  <section class="{normalize-space($classes)}">
    <xsl:call-template name="copy-anchor"/>
    <h2 id="{$anchor-pref}note.{$num}" >
      <xsl:call-template name="insertInsDelClass"/>
      <a href="#{$anchor-pref}note.{$num}">
        <xsl:call-template name="insertTitle" />
      </a>
    </h2>
    <xsl:if test="@removeInRFC='true' and (not(t) or t[1]!=$note-removeInRFC)">
      <xsl:variable name="t">
        <t><xsl:value-of select="$note-removeInRFC"/></t>
      </xsl:variable>
      <xsl:variable name="link" select="concat($anchor-pref,'note.',$num,'.p.1')"/>
      <div id="{$link}">
        <xsl:apply-templates mode="t-content" select="exslt:node-set($t)//text()">
          <xsl:with-param name="inherited-self-link" select="$link"/>
        </xsl:apply-templates>
      </div>
    </xsl:if>
    <xsl:apply-templates />
  </section>
</xsl:template>

<xsl:template match="postamble">
  <xsl:if test="normalize-space(.) != ''">
    <p>
      <xsl:call-template name="insertInsDelClass"/>
      <xsl:call-template name="editingMark" />
      <xsl:apply-templates />
    </p>
  </xsl:if>
</xsl:template>

<xsl:template match="preamble">
  <xsl:if test="normalize-space(.) != ''">
    <p>
      <xsl:call-template name="copy-anchor"/>
      <xsl:call-template name="insertInsDelClass"/>
      <xsl:call-template name="editingMark" />
      <xsl:apply-templates />
    </p>
  </xsl:if>
</xsl:template>

<xsl:template name="computed-auto-target">
  <xsl:param name="bib" select="."/>
  <xsl:param name="ref"/>

  <xsl:variable name="sec">
    <xsl:choose>
      <xsl:when test="$ref and starts-with($ref/@x:rel,'#') and not($ref/@x:sec) and not($ref/@section)">
        <xsl:variable name="extdoc" select="document($bib/x:source/@href)"/>
        <xsl:variable name="anch" select="substring-after($ref/@x:rel,'#')"/>
        <xsl:for-each select="$extdoc//*[@anchor=$anch or x:anchor-alias/@value=$anch]">
          <xsl:call-template name="get-section-number"/>
        </xsl:for-each>
      </xsl:when>
      <xsl:when test="$ref and $ref/@section">
        <xsl:value-of select="$ref/@section"/>
      </xsl:when>
      <xsl:when test="$ref">
        <xsl:value-of select="$ref/@x:sec"/>
      </xsl:when>
      <xsl:otherwise/>
    </xsl:choose>
  </xsl:variable>

  <xsl:choose>
    <xsl:when test="$ref and $bib/x:source/@href and $bib/x:source/@basename and $ref/@x:rel">
      <xsl:variable name="extdoc" select="document($bib/x:source/@href)"/>
      <xsl:variable name="targetanchor">
        <xsl:variable name="anch" select="substring-after($ref/@x:rel,'#')"/>
        <xsl:value-of select="($extdoc//*[@anchor=$anch or x:anchor-alias/@value=$anch])[1]/@anchor"/>
      </xsl:variable>
      <xsl:value-of select="concat($bib/x:source/@basename,'.',$outputExtension,'#',$targetanchor)"/>
    </xsl:when>
    <xsl:when test="$ref and $bib/x:source/@href and $bib/x:source/@basename and $sec!=''">
      <xsl:value-of select="concat($bib/x:source/@basename,'.',$outputExtension,'#')" />
      <xsl:value-of select="$anchor-pref"/>section.<xsl:value-of select="$sec"/>
      <!-- sanity check on target document -->
      <xsl:variable name="d" select="document($bib/x:source/@href)"/>
      <xsl:variable name="sections">
        <xsl:text> </xsl:text>
        <xsl:apply-templates select="$d//rfc" mode="get-section-numbers"/>
        <xsl:text> </xsl:text>
      </xsl:variable>
      <xsl:if test="not(contains($sections,concat(' ',$sec,' ')))">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg" select="concat('apparently dangling reference to ',$sec,' of ',$bib/@anchor)"/>
        </xsl:call-template>
      </xsl:if>
    </xsl:when>
    <xsl:when test="$ref and $bib/x:source/@href and $bib/x:source/@basename and $ref/@anchor">
      <xsl:value-of select="concat($bib/x:source/@basename,'.',$outputExtension,'#',$ref/@anchor)" />
    </xsl:when>
    <!-- tools.ietf.org won't have the "-latest" draft -->
    <xsl:when test="$bib/x:source/@href and $bib/x:source/@basename and substring($bib/x:source/@basename, (string-length($bib/x:source/@basename) - string-length('-latest')) + 1)='-latest'">
      <xsl:value-of select="concat($bib/x:source/@basename,'.',$outputExtension)" />
    </xsl:when>
    <!-- TODO: this should handle the case where there's one BCP entry but
    multiple RFC entries in a more useful way-->
    <xsl:when test="$bib//seriesInfo/@name='RFC'">
      <xsl:variable name="rfcEntries" select="$bib//seriesInfo[@name='RFC']"/>
      <xsl:if test="count($rfcEntries)!=1">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg" select="concat('seriesInfo/@name=RFC encountered multiple times for reference ',$bib/@anchor,', will generate link to first entry only')"/>
        </xsl:call-template>
      </xsl:if>
      <xsl:call-template name="compute-rfc-uri">
        <xsl:with-param name="rfc" select="$rfcEntries[1]/@value"/>
      </xsl:call-template>
      <xsl:if test="$ref and $sec!='' and $rfcUrlFragSection and $rfcUrlFragAppendix">
        <xsl:choose>
          <xsl:when test="translate(substring($sec,1,1),$ucase,'')=''">
            <xsl:value-of select="concat('#',$rfcUrlFragAppendix,$sec)"/>
          </xsl:when>
          <xsl:otherwise>
            <xsl:value-of select="concat('#',$rfcUrlFragSection,$sec)"/>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:if>
    </xsl:when>
    <xsl:when test="$bib//seriesInfo/@name='Internet-Draft'">
      <xsl:variable name="draftName" select="$bib//seriesInfo[@name='Internet-Draft']/@value"/>
      <xsl:variable name="endsWithLatest" select="substring($draftName, string-length($draftName) - string-length('-latest') + 1) = '-latest'"/>
      <xsl:if test="not($endsWithLatest)">
        <xsl:call-template name="compute-internet-draft-uri">
          <xsl:with-param name="internet-draft" select="$draftName"/>
          <xsl:with-param name="ref" select="$bib"/>
        </xsl:call-template>
        <xsl:if test="$ref and $sec!='' and $internetDraftUrlFragSection and $internetDraftUrlFragAppendix">
          <xsl:choose>
            <xsl:when test="translate(substring($sec,1,1),$ucase,'')=''">
              <xsl:value-of select="concat('#',$internetDraftUrlFragAppendix,$sec)"/>
            </xsl:when>
            <xsl:otherwise>
              <xsl:value-of select="concat('#',$internetDraftUrlFragSection,$sec)"/>
            </xsl:otherwise>
          </xsl:choose>
        </xsl:if>
      </xsl:if>
    </xsl:when>
    <xsl:when test="$bib//x:source/@href and document($bib//x:source/@href)/rfc/@number">
      <xsl:call-template name="compute-rfc-uri">
        <xsl:with-param name="rfc" select="document($bib//x:source/@href)/rfc/@number"/>
      </xsl:call-template>
      <xsl:if test="$ref and $sec!='' and $rfcUrlFragSection and $rfcUrlFragAppendix">
        <xsl:choose>
          <xsl:when test="translate(substring($sec,1,1),$ucase,'')=''">
            <xsl:value-of select="concat('#',$rfcUrlFragAppendix,$sec)"/>
          </xsl:when>
          <xsl:otherwise>
            <xsl:value-of select="concat('#',$rfcUrlFragSection,$sec)"/>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:if>
    </xsl:when>
    <xsl:when test="$bib//x:source/@href and document($bib//x:source/@href)/rfc/@docName">
      <xsl:variable name="draftName" select="document($bib//x:source/@href)/rfc/@docName"/>
      <xsl:variable name="endsWithLatest" select="substring($draftName, string-length($draftName) - string-length('-latest') + 1) = '-latest'"/>
      <xsl:if test="not($endsWithLatest)">
        <xsl:call-template name="compute-internet-draft-uri">
          <xsl:with-param name="internet-draft" select="$draftName"/>
          <xsl:with-param name="ref" select="$bib"/>
        </xsl:call-template>
        <xsl:if test="$ref and $sec!='' and $internetDraftUrlFragSection and $internetDraftUrlFragAppendix">
          <xsl:choose>
            <xsl:when test="translate(substring($sec,1,1),$ucase,'')=''">
              <xsl:value-of select="concat('#',$internetDraftUrlFragAppendix,$sec)"/>
            </xsl:when>
            <xsl:otherwise>
              <xsl:value-of select="concat('#',$internetDraftUrlFragSection,$sec)"/>
            </xsl:otherwise>
          </xsl:choose>
        </xsl:if>
      </xsl:if>
    </xsl:when>
    <xsl:otherwise/>
  </xsl:choose>
</xsl:template>

<!-- generates a string with white-space separated section numbers -->
<xsl:template match="node()|@*" mode="get-section-numbers">
  <xsl:apply-templates select="*" mode="get-section-numbers"/>
</xsl:template>
<xsl:template match="section|references|appendix" mode="get-section-numbers">
  <xsl:call-template name="get-section-number"/>
  <xsl:text> </xsl:text>
  <xsl:apply-templates select="*" mode="get-section-numbers"/>
</xsl:template>

<!-- titles as plain text -->
<xsl:template match="text()" mode="as-string">
  <xsl:value-of select="."/>
</xsl:template>
<xsl:template match="*" mode="as-string">
  <xsl:apply-templates select="node()" mode="as-string"/>
</xsl:template>
<xsl:template match="br" mode="as-string">
  <xsl:text> </xsl:text>
</xsl:template>

<xsl:template name="get-title-as-string">
  <xsl:param name="node" select="."/>
  <xsl:variable name="t">
    <xsl:for-each select="$node">
      <xsl:choose>
        <xsl:when test="name">
          <xsl:apply-templates select="name/node()" mode="as-string"/>
        </xsl:when>
        <xsl:when test="@title">
          <xsl:value-of select="@title"/>
        </xsl:when>
        <xsl:when test="self::abstract">Abstract</xsl:when>
        <xsl:when test="self::references">References</xsl:when>
        <xsl:otherwise/>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:value-of select="normalize-space($t)"/>
</xsl:template>

<xsl:template name="compute-section-number">
  <xsl:param name="bib"/>
  <xsl:param name="ref"/>
  
  <xsl:variable name="anch" select="substring-after($ref/@x:rel,'#')"/>
  
  <xsl:choose>
    <xsl:when test="$anch=''">
      <xsl:call-template name="error">
        <xsl:with-param name="msg">Not a fragment identifier: <xsl:value-of select="$ref/@x:rel"/></xsl:with-param>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:variable name="extdoc" select="document($bib/x:source/@href)"/>
      <xsl:variable name="nodes" select="$extdoc//*[@anchor=$anch or x:anchor-alias/@value=$anch]"/>
      <xsl:if test="not($nodes)">
        <xsl:call-template name="error">
          <xsl:with-param name="msg">Anchor '<xsl:value-of select="$anch"/>' in <xsl:value-of select="$bib/@anchor"/> not found in source file '<xsl:value-of select="$bib/x:source/@href"/>'.</xsl:with-param>
        </xsl:call-template>
      </xsl:if>
      <xsl:variable name="number">
        <xsl:for-each select="$nodes">
          <xsl:call-template name="get-section-number"/>
        </xsl:for-each>
      </xsl:variable>
      <xsl:choose>
        <xsl:when test="starts-with($number,$unnumbered)">
          <xsl:choose>
            <xsl:when test="$nodes[1]/ancestor::back">A@</xsl:when>
            <xsl:otherwise>S@</xsl:otherwise>
          </xsl:choose>
          <xsl:call-template name="get-title-as-string">
            <xsl:with-param name="node" select="$nodes[1]"/>
          </xsl:call-template>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="$number"/>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="computed-target">
  <xsl:param name="bib"/>
  <xsl:param name="ref"/>

  <xsl:variable name="bibtarget">
    <xsl:choose>
      <xsl:when test="starts-with($bib/@target,'http://www.rfc-editor.org/info/rfc') or starts-with($bib/@target,'https://www.rfc-editor.org/info/rfc') and $ref and ($ref/@x:sec or $ref/@x:rel or $ref/@section or $ref/@relative)">
        <!--ignored, use tools.ietf.org link instead -->
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="$bib/@target"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  
  <xsl:choose>
    <xsl:when test="$bibtarget!=''">
      <xsl:if test="$ref and $ref/@x:sec">
        <xsl:choose>
          <xsl:when test="$ref/@x:rel">
            <xsl:value-of select="concat($bib/@target,$ref/@x:rel)"/>
          </xsl:when>
          <xsl:otherwise>
            <xsl:call-template name="warning">
              <xsl:with-param name="msg">Can't generate section link for to <xsl:value-of select="$bib/@anchor"/>; no @x:rel specified</xsl:with-param>
            </xsl:call-template>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:if>
      <xsl:if test="$ref and $ref/@section">
        <xsl:choose>
          <xsl:when test="$ref/@relative">
            <xsl:value-of select="concat($bib/@target,$ref/@relative)"/>
          </xsl:when>
          <xsl:otherwise>
            <xsl:call-template name="warning">
              <xsl:with-param name="msg">Can't generate section link for to <xsl:value-of select="$bib/@anchor"/>; no @relative specified</xsl:with-param>
            </xsl:call-template>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:if>
    </xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="computed-auto-target">
        <xsl:with-param name="bib" select="$bib"/>
        <xsl:with-param name="ref" select="$ref"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>

</xsl:template>

<xsl:template name="compute-doi">
  <xsl:param name="rfc"/>
  <xsl:choose>
    <xsl:when test="$rfc!=''">
      <xsl:value-of select="concat('10.17487/RFC', format-number($rfc,'#0000'))"/>
    </xsl:when>
    <!-- xref seems to be for BCP, not RFC -->
    <xsl:when test=".//seriesInfo[@name='BCP'] and starts-with(@anchor, 'BCP')" />
    <xsl:when test=".//seriesInfo[@name='RFC'] and not(normalize-space((.//organization)[1])='RFC Errata') and not(starts-with(@target,'http://www.rfc-editor.org') or starts-with(@target,'https://www.rfc-editor.org'))">
      <xsl:variable name="t" select=".//seriesInfo[@name='RFC'][1]/@value"/>
      <xsl:value-of select="concat('10.17487/RFC', format-number($t,'#0000'))"/>
    </xsl:when>
    <xsl:otherwise/>
  </xsl:choose>
</xsl:template>

<!-- processed elsewhere -->
<xsl:template match="displayreference">
  <xsl:variable name="t" select="@to"/>
  <xsl:if test="//reference/@anchor=$t or count(//displayreference[@to=$t])!=1">
    <xsl:call-template name="error">
      <xsl:with-param name="msg">displayreference <xsl:value-of select="$t"/> will create non-unique reference name.</xsl:with-param>
    </xsl:call-template>
  </xsl:if>
</xsl:template>

<xsl:template name="displayname-for-author">
  <xsl:param name="not-reversed"/>

  <xsl:variable name="surname">
    <xsl:call-template name="get-author-surname"/>
  </xsl:variable>
  
  <xsl:variable name="initials">
    <xsl:call-template name="format-initials"/>
  </xsl:variable>
  <xsl:variable name="truncated-initials">
    <xsl:call-template name="truncate-initials">
      <xsl:with-param name="initials" select="$initials"/>
    </xsl:call-template>
  </xsl:variable>

  <!-- surname/initials is reversed for last author except when it's the only one -->
  <xsl:choose>
    <xsl:when test="$truncated-initials='' and $surname">
      <xsl:value-of select="$surname"/>
    </xsl:when>
    <xsl:when test="$not-reversed">
      <xsl:value-of select="concat($truncated-initials,' ',@surname)" />
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="concat($surname,', ',$truncated-initials)" />
    </xsl:otherwise>
  </xsl:choose>
  <xsl:if test="@asciiSurname!='' or @asciiInitials!=''">
    <xsl:text> (</xsl:text>
    <xsl:variable name="i">
      <xsl:choose>
        <xsl:when test="@asciiInitials!=''">
          <xsl:value-of select="@asciiInitials"/>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="$truncated-initials"/>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:variable>
    <xsl:variable name="s">
      <xsl:choose>
        <xsl:when test="@asciiSurname!=''">
          <xsl:value-of select="@asciiSurname"/>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="$surname"/>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:variable>
    <xsl:choose>
      <xsl:when test="$i=''">
        <xsl:value-of select="$s"/>
      </xsl:when>
      <xsl:when test="$not-reversed">
        <xsl:value-of select="concat($i,' ',$s)" />
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="concat($s,', ',$i)" />
      </xsl:otherwise>
    </xsl:choose>
    <xsl:text>)</xsl:text>
  </xsl:if> 
  <xsl:if test="@role='editor'">
    <xsl:text>, Ed.</xsl:text>
  </xsl:if>
</xsl:template>

<xsl:template name="link-ref-title-to">
  <xsl:choose>
    <xsl:when test="starts-with(@target,'http://www.rfc-editor.org/info/rfc') or starts-with(@target,'https://www.rfc-editor.org/info/rfc')">
      <xsl:call-template name="info">
        <xsl:with-param name="msg">Ignoring @target <xsl:value-of select="@target"/> in link calculation</xsl:with-param>
      </xsl:call-template>
      <xsl:call-template name="computed-auto-target"/>
    </xsl:when>
    <xsl:when test=".//seriesInfo/@name='RFC' and (@target='http://www.rfc-editor.org' or @target='https://www.rfc-editor.org') and starts-with(front/title,'Errata ID ') and front/author/organization='RFC Errata'">
      <!-- check for erratum link -->
      <xsl:variable name="eid" select="normalize-space(substring(front/title,string-length('Errata ID ')))"/>
      <xsl:call-template name="compute-rfc-erratum-uri">
        <xsl:with-param name="eid" select="$eid"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:when test="@target">
      <xsl:if test="normalize-space(@target)=''">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg">invalid (empty) target attribute in reference '<xsl:value-of select="@anchor"/>'</xsl:with-param>
        </xsl:call-template>
      </xsl:if>
      <xsl:value-of select="normalize-space(@target)" />
    </xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="computed-auto-target"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="emit-series-info">
  <xsl:param name="multiple-rfcs" select="false()"/>
  <xsl:param name="doi"/>

  <xsl:choose>
    <xsl:when test="not(@name) and not(@value) and ./text()">
      <xsl:text>, </xsl:text>
      <xsl:value-of select="."/>
    </xsl:when>
    <xsl:when test="@name='RFC' and $multiple-rfcs">
      <xsl:variable name="uri">
        <xsl:call-template name="compute-rfc-uri">
          <xsl:with-param name="rfc" select="@value"/>
        </xsl:call-template>
      </xsl:variable>
      <xsl:text>, </xsl:text>
      <xsl:call-template name="emit-link">
        <xsl:with-param name="target" select="$uri"/>
        <xsl:with-param name="text">
          <xsl:value-of select="@name" />
          <xsl:if test="@value!=''"><xsl:text> </xsl:text><xsl:value-of select="@value" /></xsl:if>
        </xsl:with-param>
      </xsl:call-template>
    </xsl:when>
    <xsl:when test="@name='DOI'">
      <xsl:choose>
        <xsl:when test="starts-with(@value,'10.17487/RFC') and $xml2rfc-ext-insert-doi='no'">
          <xsl:call-template name="info">
            <xsl:with-param name="msg">Removing DOI <xsl:value-of select="@value"/> from &lt;reference> element</xsl:with-param>
          </xsl:call-template>
        </xsl:when>
        <xsl:otherwise>
          <xsl:variable name="uri">
            <xsl:call-template name="compute-doi-uri">
              <xsl:with-param name="doi" select="@value"/>
            </xsl:call-template>
          </xsl:variable>
          <xsl:text>, </xsl:text>
          <xsl:call-template name="emit-link">
            <xsl:with-param name="target" select="$uri"/>
            <xsl:with-param name="text">
              <xsl:value-of select="@name" />
              <xsl:if test="@value!=''"><xsl:text> </xsl:text><xsl:value-of select="@value" /></xsl:if>
            </xsl:with-param>
          </xsl:call-template>
          <xsl:if test="$doi!='' and $doi!=@value">
            <xsl:call-template name="warning">
              <xsl:with-param name="msg">Unexpected DOI for RFC, found <xsl:value-of select="@value"/>, expected <xsl:value-of select="$doi"/></xsl:with-param>
            </xsl:call-template>
          </xsl:if>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:when>
    <xsl:when test="@name='ISBN'">
      <xsl:variable name="uri">
        <xsl:call-template name="compute-isbn-uri">
          <xsl:with-param name="isbn" select="@value"/>
        </xsl:call-template>
      </xsl:variable>
      <xsl:text>, </xsl:text>
      <xsl:call-template name="emit-link">
        <xsl:with-param name="target" select="$uri"/>
        <xsl:with-param name="text">
          <xsl:value-of select="@name" />
          <xsl:if test="@value!=''"><xsl:text> </xsl:text><xsl:value-of select="@value" /></xsl:if>
        </xsl:with-param>
      </xsl:call-template>
    </xsl:when>
    <xsl:when test="@name='Internet-Draft'">
      <xsl:variable name="basename">
        <xsl:call-template name="draft-base-name">
          <xsl:with-param name="name" select="@value"/>
        </xsl:call-template>
      </xsl:variable>
      <xsl:variable name="uri">
        <xsl:call-template name="compute-draft-status-uri">
          <xsl:with-param name="draftname" select="$basename"/>
        </xsl:call-template>
      </xsl:variable>
      <xsl:text>, </xsl:text>
      <xsl:choose>
        <xsl:when test="number($rfcno) > 7375">
          <!-- special case in RFC formatting since 2015 -->
          <xsl:call-template name="emit-link">
            <xsl:with-param name="target" select="$uri"/>
            <xsl:with-param name="text">Work in Progress</xsl:with-param>
          </xsl:call-template>
          <xsl:text>, </xsl:text>
          <xsl:value-of select="@value" />
        </xsl:when>
        <xsl:when test="/rfc/@version >= 3 and $pub-yearmonth >= 201910">
          <!-- https://tools.ietf.org/html/draft-flanagan-7322bis-04#section-4.8.6.3 -->
          <xsl:call-template name="emit-link">
            <xsl:with-param name="target" select="$uri"/>
            <xsl:with-param name="text">Work in Progress</xsl:with-param>
          </xsl:call-template>
          <xsl:text>, Internet-Draft, </xsl:text>
          <xsl:value-of select="@value" />
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="@name" />
          <xsl:if test="@value!=''"><xsl:text> </xsl:text><xsl:value-of select="@value" /></xsl:if>
          <xsl:if test="@name='Internet-Draft'">
            <xsl:text> (</xsl:text>
              <xsl:call-template name="emit-link">
                <xsl:with-param name="target" select="$uri"/>
                <xsl:with-param name="text">work in progress</xsl:with-param>
              </xsl:call-template>
            <xsl:text>)</xsl:text>
          </xsl:if>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:when>
    <xsl:otherwise>
      <xsl:text>, </xsl:text>
      <xsl:value-of select="@name"/>
      <xsl:if test="@value!=''"><xsl:text> </xsl:text><xsl:value-of select="@value"/></xsl:if>
    </xsl:otherwise>
  </xsl:choose>

  <!-- check that BCP FYI STD RFC are in the right order -->
  <xsl:if test="(@name='BCP' or @name='FYI' or @name='STD') and preceding-sibling::seriesInfo[@name='RFC']">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">RFC number preceding <xsl:value-of select="@name"/> number in reference '<xsl:value-of select="../@anchor"/>'</xsl:with-param>
    </xsl:call-template>
  </xsl:if>
</xsl:template>

<xsl:template name="find-ref-in-artwork">
  <xsl:variable name="lookup" select="concat('[',@anchor,']')"/>
  <xsl:variable name="aw" select="//artwork[contains(.,$lookup)]|//sourcecode[contains(.,$lookup)]"/>
  <xsl:for-each select="$aw[1]">
    <xsl:text> (but found in </xsl:text>
    <xsl:value-of select="local-name()"/>
    <xsl:text> element</xsl:text>
    <xsl:call-template name="lineno"/>
    <xsl:text>, consider marking up the text content which is supported by this processor, see https://greenbytes.de/tech/webdav/rfc2629xslt/rfc2629xslt.html#extension.pis)</xsl:text>
  </xsl:for-each>
</xsl:template>

<xsl:template match="reference">
  <xsl:call-template name="check-no-text-content"/>

  <!-- check for reference to reference -->
  <xsl:variable name="anchor" select="@anchor"/>
  <xsl:choose>
    <xsl:when test="not(@anchor)">
      <xsl:call-template name="error">
        <xsl:with-param name="msg">missing anchor attribute on reference, containing the text: <xsl:value-of select="normalize-space(.)"/></xsl:with-param>
      </xsl:call-template>
    </xsl:when>
    <xsl:when test="not(ancestor::ed:del) and (ancestor::rfc and not(key('xref-item',$anchor)))">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">unused reference '<xsl:value-of select="@anchor"/>'<xsl:call-template name="find-ref-in-artwork"/></xsl:with-param>
      </xsl:call-template>
    </xsl:when>
    <xsl:when test="not(ancestor::ed:del) and (not(ancestor::rfc) and not($src//xref[@target=$anchor]))">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">unused (included) reference '<xsl:value-of select="@anchor"/>'<xsl:call-template name="find-ref-in-artwork"/></xsl:with-param>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise/>
  </xsl:choose>

  <!-- check normative/informative -->
  <xsl:variable name="t-r-is-normative" select="ancestor-or-self::*[@x:nrm][1]"/>
  <xsl:variable name="r-is-normative" select="$t-r-is-normative/@x:nrm='true'"/>
  <xsl:if test="$r-is-normative and not(ancestor::ed:del)">
    <xsl:variable name="tst">
      <xsl:for-each select="key('xref-item',$anchor)">
        <xsl:variable name="t-is-normative" select="ancestor-or-self::*[@x:nrm][1]"/>
        <xsl:variable name="is-normative" select="$t-is-normative/@x:nrm='true'"/>
        <xsl:if test="$is-normative">OK</xsl:if>
      </xsl:for-each>
    </xsl:variable>
    <xsl:if test="$tst=''">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">all references to the normative reference '<xsl:value-of select="@anchor"/>' appear to be informative</xsl:with-param>
      </xsl:call-template>
    </xsl:if>
  </xsl:if>

  <xsl:call-template name="check-anchor"/>

  <dt id="{@anchor}">
    <xsl:call-template name="insertInsDelClass"/>
    <xsl:variable name="del-node" select="ancestor::ed:del"/>
    <xsl:variable name="rep-node" select="ancestor::ed:replace"/>
    <xsl:variable name="deleted" select="$del-node and ($rep-node/ed:ins)"/>
    <xsl:for-each select="../..">
      <xsl:call-template name="insert-issue-pointer">
        <xsl:with-param name="deleted-anchor" select="$deleted"/>
      </xsl:call-template>
    </xsl:for-each>
    <xsl:call-template name="reference-name"/>
  </dt>

  <xsl:call-template name="insert-reference-body"/>

</xsl:template>

<xsl:template name="insert-reference-body">
  <xsl:param name="in-reference-group" select="false()"/>

  <xsl:variable name="front" select="front[1]|document(x:source/@href)/rfc/front[1]"/>
  <xsl:if test="count($front)=0">
    <xsl:call-template name="error">
      <xsl:with-param name="msg">&lt;front> element missing for '<xsl:value-of select="@anchor"/>'</xsl:with-param>
    </xsl:call-template>
  </xsl:if>
  <xsl:if test="count($front)>1">
    <xsl:call-template name="info">
      <xsl:with-param name="msg">&lt;front> can be omitted when &lt;x:source> is specified (for '<xsl:value-of select="@anchor"/>')</xsl:with-param>
    </xsl:call-template>
  </xsl:if>
  
  <xsl:variable name="target">
    <xsl:call-template name="link-ref-title-to"/>
  </xsl:variable>

  <dd>
    <xsl:call-template name="insertInsDelClass"/>
    <xsl:if test="$in-reference-group">
      <xsl:call-template name="copy-anchor"/>
    </xsl:if>
    
    <xsl:for-each select="$front[1]/author">
      <xsl:choose>
        <xsl:when test="@surname!='' or (@fullname!='' and normalize-space(@fullname)!=normalize-space(organization))">
          <xsl:variable name="displayname">
            <xsl:call-template name="displayname-for-author">
              <xsl:with-param name="not-reversed" select="position()=last() and position()!=1"/>
            </xsl:call-template>
          </xsl:variable>
          <xsl:choose>
            <xsl:when test="address/email and $xml2rfc-linkmailto!='no'">
              <a href="mailto:{address/email}"><xsl:value-of select="$displayname" /></a>
            </xsl:when>
            <xsl:otherwise>
              <xsl:value-of select="$displayname" />
            </xsl:otherwise>
          </xsl:choose>

          <xsl:choose>
            <xsl:when test="position()=last() - 1">
              <xsl:if test="last() &gt; 2">,</xsl:if>
              <xsl:text> and </xsl:text>
            </xsl:when>
            <xsl:otherwise>
              <xsl:text>, </xsl:text>
            </xsl:otherwise>
          </xsl:choose>
        </xsl:when>
        <xsl:when test="organization/text()">
          <xsl:choose>
            <xsl:when test="address/uri">
              <a href="{address/uri}"><xsl:value-of select="organization" /></a>
            </xsl:when>
            <xsl:otherwise>
              <xsl:value-of select="organization" />
            </xsl:otherwise>
          </xsl:choose>
          <xsl:if test="organization/@ascii">
            <xsl:value-of select="concat(' (',normalize-space(organization/@ascii),')')"/>
          </xsl:if>
          <xsl:choose>
            <xsl:when test="position()=last() - 1">
              <xsl:if test="last() &gt; 2">,</xsl:if>
              <xsl:text> and </xsl:text>
            </xsl:when>
            <xsl:otherwise>
              <xsl:text>, </xsl:text>
            </xsl:otherwise>
          </xsl:choose>
        </xsl:when>
        <xsl:otherwise />
      </xsl:choose>
    </xsl:for-each>

    <xsl:variable name="quoted" select="not($front[1]/title/@x:quotes='false') and not(@quoteTitle='false')"/>
    <xsl:variable name="title">
      <xsl:apply-templates select="$front[1]/title/node()" mode="get-text-content"/>
    </xsl:variable>

    <xsl:if test="$quoted">&#8220;</xsl:if>
    <xsl:choose>
      <xsl:when test="string-length($target) &gt; 0">
        <a href="{$target}"><xsl:value-of select="$title"/></a>
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="$title"/>
      </xsl:otherwise>
    </xsl:choose>
    <xsl:if test="$quoted">&#8221;</xsl:if>

    <xsl:if test="$front[1]/title/@ascii!=''">
      <xsl:text> (</xsl:text>
      <xsl:if test="$quoted">&#8220;</xsl:if>
      <xsl:value-of select="normalize-space($front[1]/title/@ascii)" />
      <xsl:if test="$quoted">&#8221;</xsl:if>
      <xsl:text>)</xsl:text>
    </xsl:if> 

    <xsl:variable name="si" select="seriesInfo|$front[1]/seriesInfo"/>
    <xsl:if test="seriesInfo and $front[1]/seriesInfo">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">seriesInfo present both on reference and reference/front</xsl:with-param>
      </xsl:call-template>
    </xsl:if>
    
    <xsl:variable name="doi">
      <xsl:choose>
        <xsl:when test="$si">
          <xsl:call-template name="compute-doi"/>
        </xsl:when>
        <xsl:when test="document(x:source/@href)/rfc/@number">
          <xsl:call-template name="compute-doi">
            <xsl:with-param name="rfc" select="document(x:source/@href)/rfc/@number"/>
          </xsl:call-template>
        </xsl:when>
        <xsl:otherwise/>
      </xsl:choose>
    </xsl:variable>

    <xsl:for-each select="$si">
      <xsl:call-template name="emit-series-info">
        <xsl:with-param name="multiple-rfcs" select="count($si[@name='RFC']) > 1"/>
        <xsl:with-param name="doi" select="$doi"/>
      </xsl:call-template>
    </xsl:for-each>

    <!-- fall back to x:source when needed -->
    <xsl:if test="not($si) and x:source/@href">
      <xsl:variable name="derivedsi" myns:namespaceless-elements="xml2rfc">
        <xsl:if test="document(x:source/@href)/rfc/@docName">
          <seriesInfo name="Internet-Draft" value="{document(x:source/@href)/rfc/@docName}"/>
        </xsl:if>
        <xsl:if test="document(x:source/@href)/rfc/@number">
          <seriesInfo name="RFC" value="{document(x:source/@href)/rfc/@number}"/>
        </xsl:if>
      </xsl:variable>
      <xsl:variable name="tsi" select="exslt:node-set($derivedsi)/seriesInfo"/>
      <xsl:for-each select="$tsi">
        <xsl:call-template name="emit-series-info"/>
      </xsl:for-each>
    </xsl:if>

    <!-- Insert DOI for RFCs -->
    <xsl:if test="$xml2rfc-ext-insert-doi='yes' and $doi!='' and not($si[@name='DOI'])">
      <xsl:text>, </xsl:text>
      <xsl:variable name="uri">
        <xsl:call-template name="compute-doi-uri">
          <xsl:with-param name="doi" select="$doi"/>
        </xsl:call-template>
      </xsl:variable>
      <a href="{$uri}">DOI <xsl:value-of select="$doi"/></a>
    </xsl:if>

    <!-- avoid hacks using seriesInfo when it's not really series information -->
    <xsl:for-each select="x:prose|refcontent">
      <xsl:text>, </xsl:text>
      <xsl:apply-templates/>
    </xsl:for-each>

    <xsl:call-template name="insert-pub-date">
      <xsl:with-param name="front" select="$front[1]"/>
    </xsl:call-template>

    <xsl:choose>
      <xsl:when test="string-length(normalize-space(@target)) &gt; 0">
        <!-- hack: suppress specified target in reference group when it appears to be an info link to the RFC editor page -->
        <xsl:if test="not($in-reference-group) or not(contains(@target,'www.rfc-editor.org/info/rfc'))">
          <xsl:text>, &lt;</xsl:text>
          <a href="{normalize-space(@target)}"><xsl:value-of select="normalize-space(@target)"/></a>
          <xsl:text>&gt;</xsl:text>
        </xsl:if>
      </xsl:when>
      <xsl:when test="not($in-reference-group) and $xml2rfc-ext-link-rfc-to-info-page='yes' and $si[@name='BCP'] and starts-with(@anchor, 'BCP')">
        <xsl:text>, &lt;</xsl:text>
        <xsl:variable name="uri">
          <xsl:call-template name="compute-rfc-info-uri">
            <xsl:with-param name="type" select="'bcp'"/>
            <xsl:with-param name="no" select="$si[@name='BCP']/@value"/>
          </xsl:call-template>
        </xsl:variable>
        <a href="{$uri}"><xsl:value-of select="$uri"/></a>
        <xsl:text>&gt;</xsl:text>
      </xsl:when>
      <xsl:when test="not($in-reference-group) and $xml2rfc-ext-link-rfc-to-info-page='yes' and $si[@name='RFC']">
        <xsl:text>, &lt;</xsl:text>
        <xsl:variable name="uri">
          <xsl:call-template name="compute-rfc-info-uri">
            <xsl:with-param name="type" select="'rfc'"/>
            <xsl:with-param name="no" select="$si[@name='RFC']/@value"/>
          </xsl:call-template>
        </xsl:variable>
        <a href="{$uri}"><xsl:value-of select="$uri"/></a>
        <xsl:text>&gt;</xsl:text>
      </xsl:when>
      <xsl:otherwise/>
    </xsl:choose>

    <xsl:text>.</xsl:text>

    <xsl:for-each select="annotation">
      <br />
      <xsl:apply-templates />
    </xsl:for-each>
  </dd>
  
  <!-- sanity check on x:source/x:has -->
  <xsl:for-each select="x:source/x:has">
    <xsl:variable name="doc" select="document(../@href)"/>
    <xsl:variable name="anch" select="@anchor"/>
    <xsl:variable name="targ" select="@target"/>
    <xsl:if test="not(//*[@target=$anch])">
      <xsl:call-template name="info">
        <xsl:with-param name="msg">x:has with anchor '<xsl:value-of select="$anch"/>' in <xsl:value-of select="../@href"/> is unused</xsl:with-param>
      </xsl:call-template>
    </xsl:if>
    <xsl:choose>
      <xsl:when test="@target">
        <xsl:if test="not($doc//*[@anchor=$targ]) and not($doc//x:anchor-alias/@value=$targ)">
          <xsl:call-template name="error">
            <xsl:with-param name="msg">x:has with target '<xsl:value-of select="$targ"/>' not defined in <xsl:value-of select="../@href"/></xsl:with-param>
          </xsl:call-template>
        </xsl:if>
      </xsl:when>
      <xsl:otherwise>
        <xsl:if test="not($doc//*[@anchor=$anch]) and not($doc//x:anchor-alias/@value=$anch)">
          <xsl:call-template name="error">
            <xsl:with-param name="msg">x:has with anchor '<xsl:value-of select="$anch"/>' not defined in <xsl:value-of select="../@href"/></xsl:with-param>
          </xsl:call-template>
        </xsl:if>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:for-each>
</xsl:template>

<xsl:template name="insert-pub-date">
  <xsl:param name="front"/>
  
  <xsl:if test="not($front/date) and not (/rfc/@version >= 3)">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">&lt;date&gt; missing in reference '<xsl:value-of select="@anchor"/>' (note that it can be empty)</xsl:with-param>
    </xsl:call-template>
  </xsl:if>

  <xsl:choose>
    <xsl:when test="$front/date/@year != ''">
      <xsl:if test="normalize-space($front/date)!=''">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg">date element has both year attribute and text content: '<xsl:value-of select="$front/date"/>' in reference '<xsl:value-of select="@anchor"/>'</xsl:with-param>
        </xsl:call-template>
      </xsl:if>
      <xsl:if test="string(number($front/date/@year)) = 'NaN'">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg">date/@year should be a number: '<xsl:value-of select="$front/date/@year"/>' in reference '<xsl:value-of select="@anchor"/>'</xsl:with-param>
        </xsl:call-template>
      </xsl:if>
      <xsl:text>, </xsl:text>
      <xsl:if test="$front/date/@month!=''">
        <xsl:if test="front/date/@day!='' and front/date/@x:include-day='true'">
          <xsl:value-of select="front/date/@day"/>
          <xsl:text> </xsl:text>
        </xsl:if>
        <xsl:choose>
          <xsl:when test="not(local-name($front/..)='reference') and string(number($front/date/@month)) != 'NaN'">
            <xsl:call-template name="get-month-as-name">
              <xsl:with-param name="month" select="number($front/date/@month)"/>
            </xsl:call-template>
            <xsl:text> </xsl:text>
          </xsl:when>
          <xsl:otherwise>
            <xsl:value-of select="$front/date/@month"/><xsl:text> </xsl:text>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:if>
      <xsl:value-of select="$front/date/@year" />
    </xsl:when>
    <xsl:when test="document(x:source/@href)/rfc/front">
      <!-- is the date element maybe included and should be defaulted? -->
      <xsl:value-of select="concat(', ',$xml2rfc-ext-pub-month,' ',$xml2rfc-ext-pub-year)"/>
    </xsl:when>
    <xsl:when test="normalize-space($front/date)!=''">
      <xsl:text>, </xsl:text>
      <xsl:value-of select="normalize-space($front/date)"/>
    </xsl:when>
    <xsl:otherwise/>
  </xsl:choose>
</xsl:template>

<xsl:template match="referencegroup">
  <xsl:call-template name="check-no-text-content"/>

  <!-- check for reference to reference -->
  <xsl:variable name="anchor" select="@anchor"/>
  <xsl:choose>
    <xsl:when test="not(@anchor)">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">missing anchor on reference: <xsl:value-of select="."/></xsl:with-param>
      </xsl:call-template>
    </xsl:when>
    <xsl:when test="not(ancestor::ed:del) and (ancestor::rfc and not(key('xref-item',$anchor)))">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">unused reference '<xsl:value-of select="@anchor"/>'</xsl:with-param>
      </xsl:call-template>
    </xsl:when>
    <xsl:when test="not(ancestor::ed:del) and (not(ancestor::rfc) and not($src//xref[@target=$anchor]))">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">unused (included) reference '<xsl:value-of select="@anchor"/>'</xsl:with-param>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise/>
  </xsl:choose>

  <xsl:call-template name="check-anchor"/>

  <dt id="{@anchor}">
    <xsl:call-template name="insertInsDelClass"/>
    <xsl:variable name="del-node" select="ancestor::ed:del"/>
    <xsl:variable name="rep-node" select="ancestor::ed:replace"/>
    <xsl:variable name="deleted" select="$del-node and ($rep-node/ed:ins)"/>
    <xsl:for-each select="../..">
      <xsl:call-template name="insert-issue-pointer">
        <xsl:with-param name="deleted-anchor" select="$deleted"/>
      </xsl:call-template>
    </xsl:for-each>
    <xsl:call-template name="reference-name"/>
  </dt>

  <xsl:variable name="included" select="exslt:node-set($includeDirectives)/myns:include[@in=generate-id(current())]/reference"/>
  <xsl:choose>
    <xsl:when test="$xml2rfc-sortrefs='yes' and $xml2rfc-symrefs!='no'">
      <xsl:for-each select="reference|$included">
        <xsl:sort select="concat(/rfc/back/displayreference[@target=current()/@anchor]/@to,@anchor,.//ed:ins//reference/@anchor)" />
        <xsl:call-template name="insert-reference-body">
          <xsl:with-param name="in-reference-group" select="true()"/>
        </xsl:call-template>
      </xsl:for-each>
    </xsl:when>
    <xsl:otherwise>
      <xsl:for-each select="reference|$included">
        <xsl:call-template name="insert-reference-body">
          <xsl:with-param name="in-reference-group" select="true()"/>
        </xsl:call-template>
      </xsl:for-each>
    </xsl:otherwise>
  </xsl:choose>

  <xsl:if test="@target">
    <dd>&lt;<a href="{@target}"><xsl:value-of select="@target"/></a>></dd>
  </xsl:if>
</xsl:template>

<xsl:template match="references">
  <xsl:call-template name="check-no-text-content"/>

  <xsl:variable name="refseccount" select="count(/rfc/back/references)+count(/rfc/back/ed:replace/ed:ins/references)"/>

  <xsl:choose>
    <!-- handled in make-references -->
    <xsl:when test="ancestor::references"/>
    <!-- insert pseudo section when needed -->
    <xsl:when test="not(preceding::references) and $refseccount!=1">
      <xsl:call-template name="insert-conditional-hrule"/>
      <section id="{$anchor-pref}references">
        <xsl:call-template name="insert-conditional-pagebreak"/>
        <xsl:variable name="sectionNumber">
          <xsl:call-template name="get-references-section-number"/>
        </xsl:variable>
        <h2 id="{$anchor-pref}section.{$sectionNumber}">
          <a href="#{$anchor-pref}section.{$sectionNumber}">
            <xsl:call-template name="emit-section-number">
              <xsl:with-param name="no" select="$sectionNumber"/>
            </xsl:call-template>
          </a>
          <xsl:text> </xsl:text>
          <xsl:value-of select="$xml2rfc-refparent"/>
        </h2>
        <xsl:if test="$sectionNumber!=''">
          <xsl:call-template name="insert-errata">
            <xsl:with-param name="section" select="$sectionNumber"/>
          </xsl:call-template>
        </xsl:if>
        <xsl:for-each select=".|following-sibling::references">
          <xsl:call-template name="make-references">
            <xsl:with-param name="nested" select="true()"/>
          </xsl:call-template>
        </xsl:for-each>
      </section>
    </xsl:when>
    <xsl:when test="preceding::references">
      <!-- already processed -->
    </xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="make-references">
        <xsl:with-param name="nested" select="false()"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>

</xsl:template>

<xsl:template name="make-references">
  <xsl:param name="nested"/>
  
  <xsl:variable name="name">
    <xsl:if test="ancestor::ed:del">
      <xsl:text>del-</xsl:text>
    </xsl:if>
    <xsl:number level="any"/>
  </xsl:variable>

  <xsl:variable name="elemtype">
    <xsl:choose>
      <xsl:when test="$nested and count(ancestor::references)&gt;=2">h4</xsl:when>
      <xsl:when test="$nested">h3</xsl:when>
      <xsl:otherwise>h2</xsl:otherwise>
    </xsl:choose>
  </xsl:variable>

  <xsl:variable name="title">
    <xsl:choose>
      <xsl:when test="name">
        <xsl:if test="@title">
          <xsl:call-template name="warning">
            <xsl:with-param name="msg">both @title attribute and name child node present</xsl:with-param>
          </xsl:call-template>
        </xsl:if>
        <xsl:call-template name="render-name">
          <xsl:with-param name="n" select="name/node()"/>
        </xsl:call-template>
      </xsl:when>
      <xsl:when test="not(@title) or @title=''">
        <xsl:value-of select="$xml2rfc-refparent"/>
        <xsl:call-template name="warning">
          <xsl:with-param name="msg">neither @title attribute nor name child node present, choosing default of '<xsl:value-of select="$xml2rfc-refparent"/>'</xsl:with-param>
        </xsl:call-template>
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="@title"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:variable>

  <xsl:variable name="sectionNumber">
    <xsl:call-template name="get-section-number"/>
  </xsl:variable>

  <xsl:variable name="anchorpostfix">
    <xsl:if test="$nested">.<xsl:value-of select="$name"/></xsl:if>
  </xsl:variable>

  <section>
    <xsl:call-template name="copy-anchor"/>
    <xsl:if test="$name='1'">
      <xsl:call-template name="insert-conditional-pagebreak"/>
    </xsl:if>
    <div id="{$anchor-pref}references{$anchorpostfix}">
      <xsl:element name="{$elemtype}">
        <xsl:attribute name="id"><xsl:value-of select="concat($anchor-pref,'section.',$sectionNumber)"/></xsl:attribute>
        <a href="#{$anchor-pref}section.{$sectionNumber}">
          <xsl:call-template name="emit-section-number">
            <xsl:with-param name="no" select="$sectionNumber"/>
          </xsl:call-template>
        </a>
        <xsl:text> </xsl:text>
        <xsl:copy-of select="$title"/>
      </xsl:element>
      <xsl:if test="$sectionNumber!=''">
        <xsl:call-template name="insert-errata">
          <xsl:with-param name="section" select="$sectionNumber"/>
        </xsl:call-template>
      </xsl:if>
 
      <xsl:variable name="included" select="exslt:node-set($includeDirectives)/myns:include[@in=generate-id(current())]/*[self::reference or self::referencegroup]"/>
      <xsl:variable name="refs" select="reference|referencegroup|ed:del|ed:ins|ed:replace|$included"/>
      <xsl:choose>
        <xsl:when test="references">
          <xsl:for-each select="references">
            <xsl:call-template name="make-references">
              <xsl:with-param name="nested" select="true()"/>
            </xsl:call-template>
          </xsl:for-each>
          <xsl:if test="$refs">
            <xsl:call-template name="error">
              <xsl:with-param name="msg">Cannot mix &lt;references> elements with other child nodes such as <xsl:value-of select="local-name($refs[1])"/> (these will be ignored)</xsl:with-param>
            </xsl:call-template>
          </xsl:if>
        </xsl:when>
        <xsl:when test="$refs">
          <dl class="{$css-reference}">
            <xsl:choose>
              <xsl:when test="$xml2rfc-sortrefs='yes' and $xml2rfc-symrefs!='no'">
                <xsl:apply-templates select="$refs">
                  <xsl:sort select="concat(/rfc/back/displayreference[@target=current()/@anchor]/@to,@anchor,.//ed:ins//reference/@anchor)" />
                </xsl:apply-templates>
              </xsl:when>
              <xsl:otherwise>
                <xsl:apply-templates select="$refs"/>
              </xsl:otherwise>
            </xsl:choose>
          </dl>
        </xsl:when>
        <xsl:otherwise/>
      </xsl:choose>
    </div>
  </section>
</xsl:template>

<xsl:template match="xi:include">
  <xsl:choose>
    <xsl:when test="not(parent::references) and not(parent::referencegroup)">
      <xsl:call-template name="error">
        <xsl:with-param name="msg" select="'Support for x:include is restricted to child elements of &lt;references> and &lt;referencegroup>'"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <!-- handled elsewhere -->
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<!-- processed earlier -->
<xsl:template match="references/name"/>

<xsl:template match="rfc">
  <xsl:call-template name="check-no-text-content"/>
  <xsl:variable name="ignored">
    <xsl:call-template name="parse-pis">
      <xsl:with-param name="nodes" select="//processing-instruction('rfc-ext')"/>
      <xsl:with-param name="attr" select="'SANITYCHECK'"/>
    </xsl:call-template>
    <xsl:call-template name="parse-pis">
      <xsl:with-param name="nodes" select="//processing-instruction('rfc')"/>
      <xsl:with-param name="attr" select="'SANITYCHECK'"/>
    </xsl:call-template>
  </xsl:variable>

  <xsl:variable name="lang">
    <xsl:call-template name="get-lang" />
  </xsl:variable>

  <html lang="{$lang}">
    <head>
      <title>
        <xsl:if test="$rfcno!=''">
          <xsl:value-of select="concat('RFC ',$rfcno,' - ')"/>
        </xsl:if>
        <xsl:apply-templates select="front/title" mode="get-text-content" />
      </title>
      <xsl:call-template name="insertScripts" />
      <xsl:choose>
        <xsl:when test="$xml2rfc-ext-css-resource!='' and function-available('unparsed-text')">
          <xsl:comment><xsl:value-of select="$xml2rfc-ext-css-resource"/></xsl:comment>
          <style><xsl:value-of select="unparsed-text($xml2rfc-ext-css-resource,'UTF-8')"/></style>
          <xsl:if test="$xml2rfc-ext-css-contents!=''">
            <xsl:call-template name="warning">
              <xsl:with-param name="msg">xml2rfc-ext-css-contents ignored, as xml2rfc-ext-css-resource was specified as well</xsl:with-param>
            </xsl:call-template>
          </xsl:if>
        </xsl:when>
        <xsl:when test="$xml2rfc-ext-css-contents!=''">
          <xsl:comment>Specified as xml2rfc-ext-css-contents</xsl:comment>
          <style><xsl:value-of select="$xml2rfc-ext-css-contents"/></style>
        </xsl:when>
        <xsl:otherwise>
          <xsl:if test="$xml2rfc-ext-css-resource!=''">
            <xsl:call-template name="error">
              <xsl:with-param name="msg">Support for css inclusion requires 'unparsed-text' function support (XSLT 2)</xsl:with-param>
            </xsl:call-template>
          </xsl:if>
          <xsl:call-template name="insertCss" />
        </xsl:otherwise>
      </xsl:choose>
      <!-- <link rel="alternate stylesheet" media="screen" title="Plain (typewriter)" href="rfc2629tty.css" /> -->

      <!-- link elements -->
      <xsl:if test="$xml2rfc-toc='yes'">
        <link rel="Contents" href="#{$anchor-pref}toc" />
      </xsl:if>
      <xsl:if test="$xml2rfc-authorship!='no'">
        <link rel="Author" href="#{$anchor-pref}authors" />
      </xsl:if>
      <xsl:if test="$xml2rfc-private='' and not($src/rfc/@ipr='none')">
        <xsl:choose>
          <xsl:when test="$no-copylong">
            <link rel="License" href="#{$anchor-pref}copyrightnotice" />
          </xsl:when>
          <xsl:otherwise>
            <link rel="License" href="#{$anchor-pref}copyright" />
          </xsl:otherwise>
        </xsl:choose>
      </xsl:if>
      <xsl:if test="$has-index">
        <link rel="Index" href="#{$anchor-pref}index" />
      </xsl:if>
      <xsl:apply-templates select="/" mode="links" />
      <xsl:for-each select="x:link|link">
        <link>
          <xsl:choose>
            <xsl:when test="self::x:link and @basename">
              <xsl:attribute name="href">
                <xsl:value-of select="concat(@basename,'.',$outputExtension)"/>
              </xsl:attribute>
              <xsl:copy-of select="@rel|@title" />
            </xsl:when>
            <xsl:otherwise>
              <xsl:copy-of select="@*" />
            </xsl:otherwise>
          </xsl:choose>
        </link>
      </xsl:for-each>
      <xsl:if test="$is-rfc">
        <link rel="Alternate" title="Authoritative ASCII Version" href="http://www.ietf.org/rfc/rfc{$rfcno}.txt" />
        <link rel="Help" title="RFC-Editor's Status Page" href="{$rfc-info-link}" />
        <link rel="Help" title="Additional Information on tools.ietf.org" href="https://tools.ietf.org/html/rfc{$rfcno}"/>
      </xsl:if>

      <!-- viewport -->
      <meta name="viewport" content="initial-scale=1"/>

      <!-- generator -->
      <xsl:if test="$xml2rfc-ext-include-generator!='no'">
        <xsl:variable name="gen">
          <xsl:call-template name="get-generator" />
        </xsl:variable>
        <meta name="generator" content="{$gen}" />
      </xsl:if>

      <!-- keywords -->
      <xsl:if test="front/keyword">
        <xsl:variable name="keyw">
          <xsl:call-template name="get-keywords" />
        </xsl:variable>
        <meta name="keywords" content="{$keyw}" />
      </xsl:if>

      <xsl:if test="$xml2rfc-ext-support-rfc2731!='no'">
        <!-- Dublin Core Metadata -->
        <link rel="schema.dcterms" href="http://purl.org/dc/terms/" />

        <!-- DC creator, see RFC2731 -->
        <xsl:for-each select="front/author">
          <xsl:variable name="initials">
            <xsl:call-template name="get-author-initials"/>
          </xsl:variable>
          <xsl:variable name="surname">
            <xsl:call-template name="get-author-surname"/>
          </xsl:variable>
          <xsl:variable name="disp">
            <xsl:if test="$surname!=''">
              <xsl:value-of select="$surname"/>
              <xsl:if test="$initials!=''">
                <xsl:text>, </xsl:text>
                <xsl:value-of select="$initials"/>
              </xsl:if>
            </xsl:if>
          </xsl:variable>
          <xsl:if test="normalize-space($disp)!=''">
            <meta name="dcterms.creator" content="{normalize-space($disp)}" />
          </xsl:if>
        </xsl:for-each>

        <xsl:if test="$xml2rfc-private=''">
          <xsl:choose>
            <xsl:when test="$is-rfc">
              <meta name="dcterms.identifier" content="urn:ietf:rfc:{$rfcno}" />
            </xsl:when>
            <xsl:when test="@docName">
              <xsl:variable name="seq">
                <xsl:call-template name="draft-sequence-number">
                  <xsl:with-param name="name" select="@docName"/>
                </xsl:call-template>
              </xsl:variable>
              <xsl:if test="number($seq)>=0">
                <meta name="dcterms.identifier" content="urn:ietf:id:{@docName}" />
              </xsl:if>
            </xsl:when>
            <xsl:otherwise/>
          </xsl:choose>
          <meta name="dcterms.issued">
            <xsl:attribute name="content">
              <xsl:value-of select="concat($xml2rfc-ext-pub-year,'-',$pub-month-numeric)"/>
              <xsl:if test="$xml2rfc-ext-pub-day != '' and not($is-rfc)">
                <xsl:value-of select="concat('-',format-number($xml2rfc-ext-pub-day,'00'))"/>
              </xsl:if>
            </xsl:attribute>
          </meta>

          <xsl:if test="@obsoletes!=''">
            <xsl:call-template name="rfclist-for-dcmeta">
              <xsl:with-param name="list" select="@obsoletes"/>
            </xsl:call-template>
          </xsl:if>
        </xsl:if>

        <xsl:if test="front/abstract">
          <meta name="dcterms.abstract" content="{normalize-space(front/abstract)}" />
        </xsl:if>

        <xsl:if test="$is-rfc">
          <meta name="dcterms.isPartOf" content="urn:issn:2070-1721" />
        </xsl:if>

      </xsl:if>

      <!-- this replicates dcterms.abstract, but is used by Google & friends -->
      <xsl:if test="front/abstract">
        <meta name="description" content="{normalize-space(front/abstract)}" />
      </xsl:if>
    </head>

    <xsl:call-template name="body" />
  </html>
</xsl:template>

<xsl:template name="body">
  <body>
    <!-- insert onload scripts, when required -->
    <xsl:variable name="onload">
      <xsl:if test="$xml2rfc-ext-insert-metadata='yes' and $is-rfc">getMeta("<xsl:value-of select="$rfcno"/>","rfc.meta");</xsl:if>
      <xsl:if test="$xml2rfc-ext-insert-metadata='yes' and /rfc/@docName">
        <xsl:if test="$is-submitted-draft">getMeta("<xsl:value-of select="$draft-basename"/>","<xsl:value-of select="$draft-seq"/>","rfc.meta");</xsl:if>
      </xsl:if>
      <xsl:if test="/rfc/x:feedback">initFeedback();</xsl:if>
      <xsl:if test="$xml2rfc-ext-refresh-from!=''">RfcRefresh.initRefresh()</xsl:if>
    </xsl:variable>
    <xsl:if test="$onload!=''">
      <xsl:attribute name="onload">
        <xsl:value-of select="$onload"/>
      </xsl:attribute>
    </xsl:if>

    <xsl:call-template name="add-start-material" />

    <!-- insert diagnostics -->
    <xsl:call-template name="insert-diagnostics"/>

    <xsl:apply-templates select="front" />
    <xsl:apply-templates select="middle" />
    <xsl:call-template name="back" />

    <xsl:call-template name="add-end-material" />
  </body>
</xsl:template>

<xsl:template match="t">
  <xsl:param name="inherited-self-link"/>

  <xsl:variable name="textcontent" select="normalize-space(.)"/>
  <xsl:variable name="endswith" select="substring($textcontent,string-length($textcontent))"/>
  <xsl:variable name="keepwithnext" select="$endswith=':' or @keepWithNext='true'"/>
  <xsl:variable name="keepwithprevious" select="@keepWithPrevious='true'"/>

  <xsl:variable name="stype">
    <xsl:choose>
      <xsl:when test="ancestor::abstract">abstract</xsl:when>
      <xsl:when test="ancestor::note">note</xsl:when>
      <xsl:when test="ancestor::boilerplate">boilerplate</xsl:when>
      <xsl:otherwise>section</xsl:otherwise>
    </xsl:choose>
  </xsl:variable>

  <xsl:if test="preceding-sibling::section or preceding-sibling::appendix">
    <xsl:call-template name="inline-warning">
      <xsl:with-param name="msg">The paragraph below is misplaced; maybe a section is closed in the wrong place: </xsl:with-param>
      <xsl:with-param name="msg2"><xsl:value-of select="."/></xsl:with-param>
    </xsl:call-template>
  </xsl:if>
  
  <xsl:variable name="class">
    <xsl:if test="$keepwithnext">avoidbreakafter</xsl:if>
    <xsl:text> </xsl:text>
    <xsl:if test="$keepwithprevious">avoidbreakbefore</xsl:if>
  </xsl:variable>

  <div>
    <xsl:if test="not(ancestor::list)">
      <xsl:call-template name="attach-paragraph-number-as-id"/>
    </xsl:if>
    <xsl:if test="normalize-space($class)!=''">
      <xsl:attribute name="class"><xsl:value-of select="normalize-space($class)"/></xsl:attribute>
    </xsl:if>
    <xsl:if test="@indent and number(@indent)&gt;0">
      <xsl:attribute name="style">padding-left: <xsl:value-of select="@indent div 2"/>em</xsl:attribute>
    </xsl:if>
    <xsl:apply-templates mode="t-content" select="node()[1]">
      <xsl:with-param name="inherited-self-link" select="$inherited-self-link"/>
      <xsl:with-param name="anchor" select="@anchor"/>
    </xsl:apply-templates>
  </div>
</xsl:template>

<!-- for t-content, dispatch to default templates if it's block-level content -->
<xsl:template mode="t-content" match="list|figure|texttable">
  <!-- <xsl:comment>t-content block-level</xsl:comment>  -->
  <xsl:apply-templates select="." />
  <xsl:apply-templates select="following-sibling::node()[1]" mode="t-content" />
</xsl:template>

<!-- ... otherwise group into p elements -->
<xsl:template mode="t-content" match="node()">
  <xsl:param name="inherited-self-link"/>
  <xsl:param name="anchor"/>

  <xsl:variable name="p">
    <xsl:for-each select="..">
      <xsl:call-template name="get-paragraph-number" />
    </xsl:for-each>
  </xsl:variable>

  <xsl:if test="not(self::text() and normalize-space(.)='' and not(following-sibling::node()))">
    <xsl:variable name="textcontent">
      <xsl:apply-templates mode="t-content2" select="." />
    </xsl:variable>

    <xsl:choose>
      <!-- do not open a new p element if this is a whitespace-only text node and no siblings follow -->
      <xsl:when test="normalize-space($textcontent)!=''">
        <p>
          <xsl:if test="$anchor!=''">
            <xsl:attribute name="id"><xsl:value-of select="$anchor"/></xsl:attribute>
          </xsl:if>
          <xsl:variable name="stype">
            <xsl:choose>
              <xsl:when test="ancestor::abstract">abstract</xsl:when>
              <xsl:when test="ancestor::note">note</xsl:when>
              <xsl:when test="ancestor::boilerplate">boilerplate</xsl:when>
              <xsl:otherwise>section</xsl:otherwise>
            </xsl:choose>
          </xsl:variable>
          <xsl:variable name="anch">
            <xsl:if test="$p!='' and not(ancestor::li) and not(ancestor::x:lt) and not(preceding-sibling::node())">
              <xsl:value-of select="concat($anchor-pref,$stype,'.',$p)"/>
            </xsl:if>
          </xsl:variable>
          <xsl:call-template name="insertInsDelClass"/>
          <xsl:call-template name="editingMark" />
          <xsl:apply-templates mode="t-content2" select="." />
          <xsl:if test="$xml2rfc-ext-paragraph-links='yes'">
            <xsl:if test="$anch!=''">
              <a class='self' href='#{$anch}'>&#xb6;</a>
            </xsl:if>
            <xsl:if test="$inherited-self-link!=''">
              <a class='self' href='#{$inherited-self-link}'>&#xb6;</a>
            </xsl:if>
          </xsl:if>
        </p>
      </xsl:when>
      <xsl:otherwise>
        <!-- but we still need to emit non textual content, such as irefs -->
        <xsl:apply-templates mode="t-content2" select="." />
      </xsl:otherwise>
    </xsl:choose>
  </xsl:if>
  <xsl:apply-templates mode="t-content" select="following-sibling::*[self::list or self::figure or self::texttable][1]" />
</xsl:template>

<xsl:template mode="t-content2" match="*">
  <xsl:apply-templates select="." />
  <xsl:if test="not(following-sibling::node()[1] [self::list or self::figure or self::texttable])">
    <xsl:apply-templates select="following-sibling::node()[1]" mode="t-content2" />
  </xsl:if>
</xsl:template>

<xsl:template mode="t-content2" match="text()">
  <xsl:apply-templates select="." />
  <xsl:if test="not(following-sibling::node()[1] [self::list or self::figure or self::texttable])">
    <xsl:apply-templates select="following-sibling::node()[1]" mode="t-content2" />
  </xsl:if>
</xsl:template>

<xsl:template mode="t-content2" match="comment()|processing-instruction()">
  <xsl:apply-templates select="." />
  <xsl:if test="not(following-sibling::node()[1] [self::list or self::figure or self::texttable])">
    <xsl:apply-templates select="following-sibling::node()[1]" mode="t-content2" />
  </xsl:if>
</xsl:template>

<xsl:template match="title">
  <xsl:variable name="t" select="normalize-space(.)"/>
  <xsl:variable name="tlen" select="string-length($t)"/>
  <xsl:variable name="alen" select="string-length(@abbrev)"/>

  <xsl:if test="@abbrev and $alen > 40">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">title/@abbrev too long (max 40 characters)</xsl:with-param>
    </xsl:call-template>
  </xsl:if>

  <xsl:if test="$tlen > 40 and (not(@abbrev) or @abbrev='')">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">title too long, should supply title/@abbrev attribute with less than 40 characters</xsl:with-param>
    </xsl:call-template>
  </xsl:if>

  <xsl:if test="$tlen &lt;= 40 and @abbrev!=''">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">title/@abbrev was specified despite the title being short enough (<xsl:value-of select="$tlen"/>)</xsl:with-param>
      <xsl:with-param name="msg2">Title: '<xsl:value-of select="normalize-space($t)"/>', abbreviated title='<xsl:value-of select="@abbrev"/>'</xsl:with-param>
    </xsl:call-template>
  </xsl:if>

  <xsl:apply-templates />
</xsl:template>

<xsl:template name="insertTitle">
  <xsl:choose>
    <xsl:when test="@ed:old-title">
      <del>
        <xsl:if test="ancestor-or-self::*[@ed:entered-by] and @ed:datetime">
          <xsl:attribute name="title"><xsl:value-of select="concat(@ed:datetime,', ',ancestor-or-self::*[@ed:entered-by][1]/@ed:entered-by)"/></xsl:attribute>
        </xsl:if>
        <xsl:value-of select="@ed:old-title"/>
      </del>
      <ins>
        <xsl:if test="ancestor-or-self::*[@ed:entered-by] and @ed:datetime">
          <xsl:attribute name="title"><xsl:value-of select="concat(@ed:datetime,', ',ancestor-or-self::*[@ed:entered-by][1]/@ed:entered-by)"/></xsl:attribute>
        </xsl:if>
        <xsl:value-of select="@title"/>
      </ins>
    </xsl:when>
    <xsl:when test="name">
      <xsl:if test="@title">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg">both @title attribute and name child node present</xsl:with-param>
        </xsl:call-template>
      </xsl:if>
      <xsl:call-template name="render-name">
        <xsl:with-param name="n" select="name/node()"/>
        <xsl:with-param name="strip-links" select="not(ancestor-or-self::figure)"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="@title"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<!-- irefs that are section-level thus can use the section anchor -->
<xsl:variable name="section-level-irefs" select="//section/iref[count(preceding-sibling::*[not(self::iref) and not(self::x:anchor-alias) and not(self::name)])=0]"/>

<!-- suppress xml2rfc preptool artefacts -->
<xsl:template match="section[author]"/>

<xsl:template match="section|appendix">
  <xsl:call-template name="check-no-text-content"/>

  <xsl:if test="self::appendix">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">The "appendix" element is deprecated, use "section" inside "back" instead.</xsl:with-param>
    </xsl:call-template>
  </xsl:if>

  <xsl:variable name="sectionNumber">
    <xsl:choose>
      <xsl:when test="ancestor::boilerplate"></xsl:when>
      <xsl:otherwise><xsl:call-template name="get-section-number" /></xsl:otherwise>
    </xsl:choose>
  </xsl:variable>

  <xsl:if test="not(ancestor::section) and not(ancestor::boilerplate)">
    <xsl:call-template name="insert-conditional-hrule"/>
  </xsl:if>

  <xsl:variable name="elemtype">
    <xsl:choose>
      <xsl:when test="count(ancestor::section) &lt;= 3">h<xsl:value-of select="2 + count(ancestor::section)"/></xsl:when>
      <xsl:otherwise>h6</xsl:otherwise>
    </xsl:choose>
  </xsl:variable>

  <xsl:if test="$xml2rfc-ext-insert-metadata='yes' and ($is-rfc or $is-submitted-draft) and @anchor='rfc.status'">
    <aside id="{$anchor-pref}meta" class="{$css-docstatus}"></aside>
  </xsl:if>

  <xsl:variable name="classes"><xsl:if test="@removeInRFC='true'">rfcEditorRemove</xsl:if></xsl:variable>

  <section>
    <xsl:call-template name="copy-anchor"/>

    <xsl:if test="normalize-space($classes)!=''">
      <xsl:attribute name="class"><xsl:value-of select="normalize-space($classes)"/></xsl:attribute>
    </xsl:if>
    
    <xsl:element name="{$elemtype}">
      <xsl:if test="$sectionNumber!=''">
        <xsl:attribute name="id"><xsl:value-of select="$anchor-pref"/>section.<xsl:value-of select="$sectionNumber"/></xsl:attribute>
      </xsl:if>
      <xsl:choose>
        <xsl:when test="$sectionNumber='1' or $sectionNumber='A'">
          <!-- pagebreak, this the first section -->
          <xsl:attribute name="class">np</xsl:attribute>
        </xsl:when>
        <xsl:when test="not(ancestor::section) and not(ancestor::boilerplate)">
          <xsl:call-template name="insert-conditional-pagebreak"/>
        </xsl:when>
        <xsl:otherwise/>
      </xsl:choose>

      <xsl:call-template name="insertInsDelClass" />

      <xsl:if test="$sectionNumber!='' and not(contains($sectionNumber,$unnumbered))">
        <a href="#{$anchor-pref}section.{$sectionNumber}">
          <xsl:call-template name="emit-section-number">
            <xsl:with-param name="no" select="$sectionNumber"/>
            <xsl:with-param name="appendixPrefix" select="true()"/>
          </xsl:call-template>
        </a>
        <xsl:text>&#0160;</xsl:text>
      </xsl:if>

      <!-- issue tracking? -->
      <xsl:if test="@ed:resolves">
        <xsl:call-template name="insert-issue-pointer"/>
      </xsl:if>

      <xsl:call-template name="check-anchor"/>
      <xsl:variable name="anchor">
        <xsl:choose>
          <xsl:when test="@anchor"><xsl:value-of select="@anchor"/></xsl:when>
          <xsl:otherwise><xsl:call-template name="sluggy-anchor"/></xsl:otherwise>
        </xsl:choose>
      </xsl:variable>

      <xsl:variable name="name">
        <xsl:choose>
          <xsl:when test="starts-with(@title,'Since ')">
            <xsl:value-of select="substring-after(@title,'Since ')"/>
          </xsl:when>
          <xsl:when test="starts-with(@title,'draft-')">
            <xsl:value-of select="@title"/>
          </xsl:when>
          <xsl:otherwise/>
        </xsl:choose>
      </xsl:variable>
      
      <xsl:variable name="basename">
        <xsl:call-template name="draft-base-name">
          <xsl:with-param name="name" select="$name"/>
        </xsl:call-template>
      </xsl:variable>
      <xsl:variable name="seq">
        <xsl:call-template name="draft-sequence-number">
          <xsl:with-param name="name" select="$name"/>
        </xsl:call-template>
      </xsl:variable>

      <xsl:variable name="offset">
        <xsl:choose>
          <xsl:when test="starts-with(@title,'Since ')">1</xsl:when>        
          <xsl:otherwise>0</xsl:otherwise>
        </xsl:choose>
      </xsl:variable>
      
      <xsl:variable name="smells-like-change-log" select="ancestor-or-self::section[@removeInRFC='true'] or ancestor::section[@title='Changes'] or ancestor::section[@title='Change Log']"/>
      
      <xsl:variable name="diff-uri">
        <xsl:if test="$smells-like-change-log and $basename!=''">
          <xsl:variable name="next" select="concat($basename,'-',format-number($offset + $seq,'00'))"/>
          <xsl:choose>
            <!-- check whether the "next" draft exists (is mentioned in a sibling section -->
            <xsl:when test="../section[contains(@title,$next)]">
              <xsl:call-template name="compute-diff-uri">
                <xsl:with-param name="name" select="$next"/>
              </xsl:call-template>
            </xsl:when>
            <xsl:when test="starts-with(ancestor::rfc/@docName,$basename)">
              <xsl:call-template name="compute-latest-diff-uri">
                <xsl:with-param name="name" select="$basename"/>
              </xsl:call-template>
            </xsl:when>
            <xsl:otherwise/>
          </xsl:choose>
        </xsl:if>
      </xsl:variable>

      <xsl:variable name="text-uri">
        <xsl:if test="$smells-like-change-log and $basename!=''">
          <xsl:call-template name="compute-internet-draft-uri">
            <xsl:with-param name="internet-draft" select="$name"/>
          </xsl:call-template>
        </xsl:if>
      </xsl:variable>

      <xsl:choose>
        <xsl:when test="$anchor!=''">
          <a href="#{$anchor}"><xsl:call-template name="insertTitle"/></a>
        </xsl:when>
        <xsl:otherwise>
          <xsl:call-template name="insertTitle"/>
        </xsl:otherwise>
      </xsl:choose>

      <xsl:if test="$xml2rfc-ext-paragraph-links='yes' and $text-uri!=''">
        <xsl:text> </xsl:text>
        <a class="self" href="{$text-uri}" title="plain text">&#x1f4c4;</a>
      </xsl:if>
      <xsl:if test="$xml2rfc-ext-paragraph-links='yes' and $diff-uri!=''">
        <xsl:text> </xsl:text>
        <a class="self" href="{$diff-uri}" title="diffs">&#x1f50d;</a>
      </xsl:if>
    </xsl:element>

    <xsl:if test="$sectionNumber!=''">
      <xsl:call-template name="insert-errata">
        <xsl:with-param name="section" select="$sectionNumber"/>
      </xsl:call-template>
    </xsl:if>
    
    <xsl:if test="@removeInRFC='true' and (not(t) or t[1]!=$section-removeInRFC)">
      <xsl:variable name="t">
        <t><xsl:value-of select="$section-removeInRFC"/></t>
      </xsl:variable>
      <xsl:variable name="link" select="concat($anchor-pref,'section.',$sectionNumber,'.p.1')"/>
      <div id="{$link}">
        <xsl:apply-templates mode="t-content" select="exslt:node-set($t)//text()">
          <xsl:with-param name="inherited-self-link" select="$link"/>
        </xsl:apply-templates>
      </div>
    </xsl:if>

    <!-- continue with all child elements but the irefs processed above -->
    <xsl:for-each select="*">
      <xsl:if test="count(.|$section-level-irefs)!=count($section-level-irefs)">
        <xsl:apply-templates select="."/>
      </xsl:if>
    </xsl:for-each>
  </section>
</xsl:template>

<!-- errata handling -->
<xsl:template name="insert-errata">
  <xsl:param name="section"/>
  <xsl:variable name="es" select="$errata-parsed[section=$section or (not(section) and $section='1')]"/>
  <xsl:if test="$es">
    <aside class="{$css-erratum}">
      <xsl:for-each select="$es">
        <xsl:sort select="@eid" data-type="number"/>
        <div>
          <xsl:variable name="tooltip">
            <xsl:value-of select="@reported-by"/>
            <xsl:text>, </xsl:text>
            <xsl:value-of select="@reported"/>
            <xsl:if test="@type"> (<xsl:value-of select="@type"/>)</xsl:if>
          </xsl:variable>
          <xsl:variable name="uri">
            <xsl:call-template name="compute-rfc-erratum-uri">
              <xsl:with-param name="eid" select="@eid"/>
            </xsl:call-template>
          </xsl:variable>
          <a href="{$uri}" title="{$tooltip}">Erratum <xsl:value-of select="@eid"/></a>
          <xsl:choose>
            <xsl:when test="@status='Verified'"><xsl:text> </xsl:text><span title="verified">&#x2714;</span></xsl:when>
            <xsl:when test="@status='Reported'"><xsl:text> </xsl:text><span title="reported">&#x2709;</span></xsl:when>
            <xsl:when test="@status='Held for Document Update'"><xsl:text> </xsl:text><span title="held for update">&#x2700;</span></xsl:when>
            <xsl:otherwise/>
          </xsl:choose>
        </div>
      </xsl:for-each>
    </aside>
  </xsl:if>
</xsl:template>

<!-- already processed by insertTitle -->
<xsl:template match="note/name"/>
<xsl:template match="section/name"/>

<xsl:template match="spanx[@style='emph' or not(@style)]|em">
  <em>
    <xsl:call-template name="copy-anchor"/>
    <xsl:apply-templates />
  </em>
</xsl:template>

<xsl:template match="spanx[@style='verb' or @style='vbare']|tt">
  <span class="tt">
    <xsl:call-template name="copy-anchor"/>
    <xsl:apply-templates />
  </span>
</xsl:template>

<xsl:template match="spanx[@style='strong']|strong">
  <strong>
    <xsl:call-template name="copy-anchor"/>
    <xsl:apply-templates />
  </strong>
</xsl:template>

<xsl:template match="spanx[@style!='']" priority="0.1">
  <xsl:call-template name="warning">
    <xsl:with-param name="msg">unknown spanx style attribute '<xsl:value-of select="@style"/>' ignored</xsl:with-param>
  </xsl:call-template>
  <span>
    <xsl:call-template name="copy-anchor"/>
    <xsl:apply-templates />
  </span>
</xsl:template>

<xsl:template name="insert-blank-lines">
  <xsl:param name="no"/>
  <xsl:choose>
    <xsl:when test="$no >= $xml2rfc-ext-vspace-pagebreak">
      <br/>
      <!-- done; this probably was an attempt to generate a pagebreak -->
    </xsl:when>
    <xsl:when test="$no &lt;= 0">
      <br/>
      <!-- done -->
    </xsl:when>
    <xsl:otherwise>
      <br/>
      <xsl:call-template name="insert-blank-lines">
        <xsl:with-param name="no" select="$no - 1"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template match="vspace[not(@blankLines)]">
  <br />
</xsl:template>

<xsl:template match="vspace">
  <xsl:call-template name="insert-blank-lines">
    <xsl:with-param name="no" select="@blankLines"/>
  </xsl:call-template>
</xsl:template>

<xsl:template match="br">
  <br/>
</xsl:template>

<!-- keep the root for the case when we process XSLT-inline markup -->
<xsl:variable name="src" select="/" />

<xsl:template name="render-section-ref">
  <xsl:param name="from" />
  <xsl:param name="to" />

  <xsl:variable name="refname">
    <xsl:for-each select="$to">
      <xsl:call-template name="get-section-type"/>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="refnum">
    <xsl:for-each select="$to">
      <xsl:call-template name="get-section-number" />
    </xsl:for-each>
  </xsl:variable>
  <xsl:choose>
    <xsl:when test="$from/@format='counter'">
      <xsl:choose>
        <xsl:when test="$to/self::abstract">
          <xsl:call-template name="error">
            <xsl:with-param name="inline">no</xsl:with-param>
            <xsl:with-param name="msg">xref to abstract with format='counter' not allowed</xsl:with-param>
          </xsl:call-template>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="$refnum"/>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:when>
    <xsl:when test="$from/@format='title'">
      <xsl:choose>
        <xsl:when test="$to/name">
          <xsl:call-template name="render-name-ref">
            <xsl:with-param name="n" select="$to/name/node()"/>
          </xsl:call-template>
        </xsl:when>
        <xsl:when test="$to/@title">
          <xsl:value-of select="normalize-space($to/@title)"/>
        </xsl:when>
        <xsl:when test="$to/self::abstract">Abstract</xsl:when>
        <xsl:when test="$to/self::references">References</xsl:when>
        <xsl:otherwise/>
      </xsl:choose>
    </xsl:when>
    <xsl:when test="$from/@format='none'">
      <!-- Nothing to do -->
    </xsl:when>
    <xsl:otherwise>
      <xsl:choose>
        <xsl:when test="starts-with($refnum,$unnumbered)">
          <xsl:value-of select="$refname"/>
          <xsl:text> "</xsl:text>
          <xsl:choose>
            <xsl:when test="$to/name">
              <xsl:apply-templates select="$to/name/node()"/>
            </xsl:when>
            <xsl:otherwise>
              <xsl:value-of select="$to/@title"/>
            </xsl:otherwise>
          </xsl:choose>
          <xsl:text>"</xsl:text>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="normalize-space(concat($refname,' ',$refnum))"/>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="get-section-xref-format">
  <xsl:param name="default"/>
  <xsl:choose>
    <xsl:when test="self::relref and (*|text())">
      <xsl:if test="@displayFormat">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg">@displayFormat is ignored on &lt;relref> with content</xsl:with-param>
        </xsl:call-template>
      </xsl:if>
    </xsl:when>
    <xsl:when test="self::relref">
      <xsl:choose>
        <xsl:when test="not(@displayFormat)">of</xsl:when>
        <xsl:when test="@displayFormat='parens' or @displayFormat='of' or @displayFormat='comma' or @displayFormat='bare'">
          <xsl:value-of select="@displayFormat"/>
        </xsl:when>
        <xsl:otherwise>
          <xsl:call-template name="warning">
            <xsl:with-param name="msg">unknown format for @displayFormat: <xsl:value-of select="@displayFormat"/></xsl:with-param>
          </xsl:call-template>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:when>
    <xsl:when test="self::xref and @sectionFormat">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">@sectionFormat is deprecated, use @x:fmt instead</xsl:with-param>
      </xsl:call-template>
      <xsl:if test="@x:fmt">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg">both @x:fmt and @sectionFormat specified</xsl:with-param>
        </xsl:call-template>
      </xsl:if>
      <xsl:choose>
        <xsl:when test="@sectionFormat='of' or @sectionFormat='comma' or @sectionFormat='parens' or @sectionFormat='bare'">
          <xsl:value-of select="@sectionFormat"/>
        </xsl:when>
        <xsl:otherwise>
          <xsl:call-template name="warning">
            <xsl:with-param name="msg">unknown format for @sectionFormat</xsl:with-param>
          </xsl:call-template>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:when>
    <xsl:when test="self::xref and @x:fmt">
      <xsl:choose>
        <xsl:when test="@x:fmt='()'">parens</xsl:when>
        <xsl:when test="@x:fmt='of'">of</xsl:when>
        <xsl:when test="@x:fmt=','">comma</xsl:when>
        <xsl:when test="@x:fmt='none'">none</xsl:when>
        <xsl:when test="@x:fmt='sec'">section</xsl:when>
        <xsl:when test="@x:fmt='number'">bare</xsl:when>
        <xsl:otherwise>
          <xsl:call-template name="warning">
            <xsl:with-param name="msg">unknown format for @x:fmt</xsl:with-param>
          </xsl:call-template>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="$default"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="get-section-xref-section">
  <xsl:choose>
    <xsl:when test="@section">
      <xsl:value-of select="@section"/>
    </xsl:when>
    <xsl:when test="@x:sec">
      <xsl:value-of select="@x:sec"/>
    </xsl:when>
    <xsl:otherwise/>
  </xsl:choose>
</xsl:template>

<xsl:template match="xref[*|text()]|relref[*|text()]">

  <xsl:variable name="xref" select="."/>
 
  <xsl:variable name="target">
    <xsl:call-template name="get-target-anchor"/>
  </xsl:variable>
  <xsl:variable name="node" select="key('anchor-item',$target)" />
  <xsl:variable name="anchor"><xsl:value-of select="$anchor-pref"/>xref.<xsl:value-of select="$target"/>.<xsl:number level="any" count="xref[@target=$target]|relref[@target=$target]"/></xsl:variable>

  <xsl:if test="@target!=$target">
    <xsl:call-template name="info">
      <xsl:with-param name="msg">Target '<xsl:value-of select="@target"/>' rewritten to '<xsl:value-of select="$target"/>'.</xsl:with-param>
    </xsl:call-template>
  </xsl:if>

  <xsl:variable name="sfmt">
    <xsl:call-template name="get-section-xref-format"/>
  </xsl:variable>

  <xsl:variable name="ssec">
    <xsl:call-template name="get-section-xref-section"/>
  </xsl:variable>

  <xsl:variable name="href">
    <xsl:call-template name="computed-target">
      <xsl:with-param name="bib" select="$node"/>
      <xsl:with-param name="ref" select="."/>
    </xsl:call-template>
  </xsl:variable>

  <xsl:choose>
    <xsl:when test="self::relref and not($node/self::reference)">
      <xsl:call-template name="error">
        <xsl:with-param name="msg">relref/@target must be a reference</xsl:with-param>
      </xsl:call-template>
    </xsl:when>
    <xsl:when test="self::relref and $href=''">
      <xsl:apply-templates/>
    </xsl:when>
    <xsl:when test="self::relref">
      <xsl:call-template name="emit-link">
        <xsl:with-param name="target" select="$href"/>
        <xsl:with-param name="id" select="$anchor"/>
        <xsl:with-param name="child-nodes" select="*|text()"/>
        <xsl:with-param name="index-item" select="$target"/>
        <xsl:with-param name="index-subitem" select="$ssec"/>
      </xsl:call-template>
    </xsl:when>
  
    <!-- $sfmt='none': do not generate any links -->
    <xsl:when test="$sfmt='none'">
      <xsl:choose>
        <xsl:when test="$node/self::reference">
          <xsl:call-template name="emit-link">
            <xsl:with-param name="id" select="$anchor"/>
            <xsl:with-param name="citation-title" select="normalize-space($node/front/title)"/>
            <xsl:with-param name="child-nodes" select="*|text()"/>
            <xsl:with-param name="index-item" select="$target"/>
            <xsl:with-param name="index-subitem" select="$ssec"/>
          </xsl:call-template>
        </xsl:when>
        <xsl:otherwise>
          <xsl:apply-templates/>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:when>

    <!-- Other $sfmt values than "none": unsupported -->
    <xsl:when test="$sfmt!='' and $sfmt!='none'">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg" select="concat('ignoring unknown xref section format extension: ',$sfmt)"/>
      </xsl:call-template>
    </xsl:when>

    <!-- Section links -->
    <xsl:when test="$node/self::section or $node/self::appendix">
      <xsl:choose>
        <xsl:when test="@format='none' or $xml2rfc-ext-xref-with-text-generate='nothing'">
          <xsl:call-template name="emit-link">
            <xsl:with-param name="target" select="concat('#',$target)"/>
            <xsl:with-param name="id">
              <xsl:if test="//iref[@x:for-anchor=$target] | //iref[@x:for-anchor='' and ../@anchor=$target]"><xsl:value-of select="$anchor"/></xsl:if>
            </xsl:with-param>
            <xsl:with-param name="child-nodes" select="*|text()"/>
          </xsl:call-template>
        </xsl:when>
        <xsl:otherwise>
          <!-- index links to this xref -->
          <xsl:variable name="ireftargets" select="key('iref-xanch',$target) | key('iref-xanch','')[../@anchor=$target]"/>

          <xsl:apply-templates/>
          <xsl:text> (</xsl:text>
          <xsl:call-template name="xref-to-section">
            <xsl:with-param name="from" select="$xref"/>
            <xsl:with-param name="to" select="$node"/>
            <xsl:with-param name="id" select="$anchor"/>
            <xsl:with-param name="irefs" select="$ireftargets"/>
          </xsl:call-template>
          <xsl:text>)</xsl:text>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:when>

    <xsl:when test="$node/self::cref and $node/@display='false'">
      <xsl:for-each select="$xref">
        <xsl:call-template name="error">
          <xsl:with-param name="msg" select="concat('Comment ',$node/@anchor,' is hidden and thus can not be referenced')"/>
        </xsl:call-template>
      </xsl:for-each>
    </xsl:when>

    <xsl:when test="$node/self::cref and $xml2rfc-comments='no'">
      <xsl:call-template name="error">
        <xsl:with-param name="msg">xref to cref, but comments aren't included in the output</xsl:with-param>
      </xsl:call-template>
    </xsl:when>

    <xsl:otherwise>
      <!-- check normative/informative -->
      <xsl:variable name="t-is-normative" select="ancestor-or-self::*[@x:nrm][1]"/>
      <xsl:variable name="is-normative" select="$t-is-normative/@x:nrm='true'"/>
      <xsl:if test="count($node)=1 and $is-normative">
        <xsl:variable name="t-r-is-normative" select="$node/ancestor-or-self::*[@x:nrm][1]"/>
        <xsl:variable name="r-is-normative" select="$t-r-is-normative/@x:nrm='true'"/>
        <xsl:if test="not($r-is-normative)">
          <xsl:call-template name="warning">
            <xsl:with-param name="msg" select="concat('Potentially normative reference to ',$target,' not referenced normatively')"/>
          </xsl:call-template>
        </xsl:if>
      </xsl:if>

      <xsl:call-template name="emit-link">
        <xsl:with-param name="target" select="concat('#',$target)"/>
        <xsl:with-param name="id">
          <xsl:if test="@format='none'"><xsl:value-of select="$anchor"/></xsl:if>
        </xsl:with-param>
        <xsl:with-param name="child-nodes" select="*|text()"/>
      </xsl:call-template>

      <xsl:if test="not(@format='none' or $xml2rfc-ext-xref-with-text-generate='nothing')">
        <xsl:for-each select="$src/rfc/back/references//reference[@anchor=$target]">
          <xsl:text> </xsl:text>
          <xsl:call-template name="emit-link">
            <xsl:with-param name="citation-title" select="normalize-space(front/title)"/>
            <xsl:with-param name="id" select="$anchor"/>
            <xsl:with-param name="text">
              <xsl:call-template name="reference-name"/>
            </xsl:with-param>
          </xsl:call-template>
        </xsl:for-each>
      </xsl:if>
    </xsl:otherwise>
  </xsl:choose>

</xsl:template>

<xsl:key name="iref-xanch" match="iref[@x:for-anchor]" use="@x:for-anchor"/>

<!-- xref to section or appendix -->
<xsl:template name="xref-to-section">
  <xsl:param name="from"/>
  <xsl:param name="to"/>
  <xsl:param name="id"/>
  <xsl:param name="irefs"/>
  
  <a href="#{$from/@target}">
    <xsl:if test="$irefs">
      <!-- insert id when a backlink to this xref is needed in the index -->
      <xsl:attribute name="id"><xsl:value-of select="$id"/></xsl:attribute>
    </xsl:if>
    <xsl:attribute name="title">
      <xsl:call-template name="get-title-as-string">
        <xsl:with-param name="node" select="$to"/>
      </xsl:call-template>
    </xsl:attribute>
    <xsl:call-template name="render-section-ref">
      <xsl:with-param name="from" select="$from"/>
      <xsl:with-param name="to" select="$to"/>
    </xsl:call-template>
  </a>
</xsl:template>

<!-- xref to figure -->
<xsl:template name="xref-to-figure-text">
  <xsl:param name="from"/>
  <xsl:param name="to"/>

  <xsl:variable name="figcnt">
    <xsl:for-each select="$to">
      <xsl:call-template name="get-figure-number"/>
    </xsl:for-each>
  </xsl:variable>
  <xsl:choose>
    <xsl:when test="$from/@format='counter'">
      <xsl:value-of select="$figcnt" />
    </xsl:when>
    <xsl:when test="$from/@format='none'">
      <!-- Nothing to do -->
    </xsl:when>
    <xsl:when test="$from/@format='title'">
      <xsl:choose>
        <xsl:when test="$to/name">
          <xsl:call-template name="render-name-ref">
            <xsl:with-param name="n" select="$to/name/node()"/>
          </xsl:call-template>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="normalize-space($to/@title)" />
        </xsl:otherwise>
      </xsl:choose>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="normalize-space(concat('Figure ',$figcnt))"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="xref-to-figure">
  <xsl:param name="from"/>
  <xsl:param name="to"/>

  <xsl:variable name="title">
    <xsl:call-template name="get-title-as-string">
      <xsl:with-param name="node" select="$to"/>
    </xsl:call-template>
  </xsl:variable>
  <a href="#{$from/@target}">
    <xsl:if test="$title!=''">
      <xsl:attribute name="title">
        <xsl:value-of select="$title"/>
      </xsl:attribute>
    </xsl:if>
    <xsl:call-template name="xref-to-figure-text">
      <xsl:with-param name="from" select="$from"/>
      <xsl:with-param name="to" select="$to"/>
    </xsl:call-template>
  </a>
</xsl:template>

<!-- xref to table -->
<xsl:template name="xref-to-table-text">
  <xsl:param name="from"/>
  <xsl:param name="to"/>

  <xsl:variable name="tabcnt">
    <xsl:for-each select="$to">
      <xsl:call-template name="get-table-number"/>
    </xsl:for-each>
  </xsl:variable>
  <xsl:choose>
    <xsl:when test="$from/@format='counter'">
      <xsl:value-of select="$tabcnt" />
    </xsl:when>
    <xsl:when test="$from/@format='none'">
      <!-- Nothing to do -->
    </xsl:when>
    <xsl:when test="$from/@format='title'">
      <xsl:choose>
        <xsl:when test="$to/self::table">
          <xsl:call-template name="render-name-ref">
            <xsl:with-param name="n" select="$to/name/node()"/>
          </xsl:call-template>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="$to/@title" />
        </xsl:otherwise>
      </xsl:choose>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="normalize-space(concat('Table ',$tabcnt))"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="xref-to-table">
  <xsl:param name="from"/>
  <xsl:param name="to"/>

  <xsl:variable name="title">
    <xsl:call-template name="get-title-as-string">
      <xsl:with-param name="node" select="$to"/>
    </xsl:call-template>
  </xsl:variable>
  <a href="#{$from/@target}">
    <xsl:if test="$title!=''">
      <xsl:attribute name="title">
        <xsl:value-of select="$title"/>
      </xsl:attribute>
    </xsl:if>
    <xsl:call-template name="xref-to-table-text">
      <xsl:with-param name="from" select="$from"/>
      <xsl:with-param name="to" select="$to"/>
    </xsl:call-template>
  </a>
</xsl:template>

<!-- xref to paragraph -->
<xsl:template name="xref-to-paragraph-text">
  <xsl:param name="from"/>
  <xsl:param name="to"/>

  <xsl:variable name="tcnt">
    <xsl:for-each select="$to">
      <xsl:call-template name="get-paragraph-number" />
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="pparent" select="$to/.."/>
  <xsl:variable name="listtype">
    <xsl:choose>
      <xsl:when test="$pparent/self::list">
        <xsl:value-of select="$pparent/@style"/>
      </xsl:when>
      <xsl:when test="$pparent/self::dl">definition</xsl:when> 
      <xsl:when test="$pparent/self::ol[@type='a']">letters</xsl:when> 
      <xsl:when test="$pparent/self::ol[@type='A']">Letters</xsl:when> 
      <xsl:when test="$pparent/self::ol[@type='i']">rnumbers</xsl:when> 
      <xsl:when test="$pparent/self::ol[@type='I']">Rnumbers</xsl:when> 
      <xsl:when test="$pparent/self::ol[string-length(@type)>1]">format <xsl:value-of select="$pparent/self::ol/@type"/></xsl:when> 
      <xsl:when test="$pparent/self::ol">numbers</xsl:when> 
      <xsl:otherwise></xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <xsl:variable name="s">
    <xsl:choose>
      <xsl:when test="$pparent/self::ol and $pparent/@group">
        <xsl:call-template name="ol-start">
          <xsl:with-param name="node" select="$pparent"/>
        </xsl:call-template>
      </xsl:when>
      <xsl:when test="$pparent/self::list and $pparent/@counter">
        <xsl:for-each select="$pparent">
          <xsl:value-of select="1 + count(preceding::list[@counter=$pparent/@counter]/*)"/>
        </xsl:for-each>
      </xsl:when>
      <xsl:when test="$pparent/self::ol and $pparent/@start">
        <xsl:value-of select="$pparent/@start"/>
      </xsl:when>
      <xsl:otherwise>1</xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <xsl:variable name="n">
    <xsl:for-each select="$to">
      <xsl:number/>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="format">
    <xsl:choose>
      <xsl:when test="$listtype='letters'">a</xsl:when>
      <xsl:when test="$listtype='Letters'">A</xsl:when>
      <xsl:when test="$listtype='rnumbers'">i</xsl:when>
      <xsl:when test="$listtype='Rnumbers'">I</xsl:when>
      <xsl:otherwise>1</xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <xsl:variable name="listindex">
    <xsl:choose>
      <xsl:when test="starts-with($listtype,'format ')">
        <xsl:call-template name="expand-format-percent">
          <xsl:with-param name="format" select="substring-after($listtype,'format ')"/>
          <xsl:with-param name="pos" select="$n + $s - 1"/>
        </xsl:call-template>
      </xsl:when>
      <xsl:otherwise>
        <xsl:number value="$n + $s - 1" format="{$format}"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <xsl:choose>
    <xsl:when test="$from/@format='counter'">
      <xsl:choose>
        <xsl:when test="$listtype!='' and $listindex!=''">
          <xsl:value-of select="$listindex"/>
        </xsl:when>
        <xsl:when test="$listtype!='' and $listindex=''">
          <xsl:call-template name="warning">
            <xsl:with-param name="msg" select="concat('Use of format=counter for unsupported list type ',$listtype)"/>
          </xsl:call-template>
          <xsl:value-of select="$tcnt"/>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="$tcnt"/>              
        </xsl:otherwise>
      </xsl:choose>
    </xsl:when>
    <xsl:when test="$from/@format='none'">
      <!-- Nothing to do -->
    </xsl:when>
    <xsl:when test="$from/@format='title'">
      <xsl:choose>
        <xsl:when test="$to/self::dt">
          <xsl:apply-templates select="$to/node()"/>
        </xsl:when>
        <xsl:when test="$to/@hangText">
          <xsl:value-of select="normalize-space($to/@hangText)"/>
        </xsl:when>
        <xsl:when test="$to/@title">
          <xsl:value-of select="normalize-space($to/@title)"/>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="$to/@anchor"/>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:when>
    <xsl:otherwise>
      <xsl:variable name="pn" select="normalize-space(substring-after($tcnt,'p.'))"/>
      <xsl:text>Paragraph </xsl:text>
      <xsl:choose>
        <xsl:when test="$pn=''">
          <xsl:text>?</xsl:text>
          <xsl:call-template name="warning">
            <xsl:with-param name="msg" select="concat('No paragraph number for link target ',$from/@target)"/>
          </xsl:call-template>
        </xsl:when>
        <xsl:otherwise><xsl:value-of select="$pn"/></xsl:otherwise>
      </xsl:choose>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="xref-to-paragraph">
  <xsl:param name="from"/>
  <xsl:param name="to"/>
  <xsl:param name="anchor"/>

  <a href="#{$anchor}">
    <xsl:call-template name="xref-to-paragraph-text">
      <xsl:with-param name="from" select="$from"/>
      <xsl:with-param name="to" select="$to"/>
    </xsl:call-template>
  </a>
</xsl:template>

<!-- xref to comment -->
<xsl:template name="xref-to-comment">
  <xsl:param name="from"/>
  <xsl:param name="to"/>

  <xsl:call-template name="emit-link">
    <xsl:with-param name="target" select="concat('#',$from/@target)"/>
    <xsl:with-param name="text">
      <xsl:variable name="name">
        <xsl:for-each select="$to">
          <xsl:call-template name="get-comment-name" />
        </xsl:for-each>
      </xsl:variable>
      <xsl:choose>
        <xsl:when test="$from/@format='counter'">
          <xsl:call-template name="error">
            <xsl:with-param name="inline">no</xsl:with-param>
            <xsl:with-param name="msg">xref to cref with format='counter' not allowed</xsl:with-param>
          </xsl:call-template>
          <xsl:value-of select="$name" />
        </xsl:when>
        <xsl:when test="$from/@format='none'">
          <!-- Nothing to do -->
        </xsl:when>
        <xsl:when test="$from/@format='title'">
          <xsl:value-of select="$to/@anchor"/>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="normalize-space(concat('Comment ',$name))"/>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:with-param>
  </xsl:call-template>
</xsl:template>

<xsl:template name="emit-link">
  <xsl:param name="target"/>
  <xsl:param name="id"/>
  <xsl:param name="title"/>
  <xsl:param name="citation-title"/>
  <xsl:param name="index-item"/>
  <xsl:param name="index-subitem"/>
  <xsl:param name="text"/>
  <xsl:param name="child-nodes"/>
  
  <xsl:if test="$text!='' and $child-nodes">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">emit-link called both with text and child-nodes</xsl:with-param>
    </xsl:call-template>
  </xsl:if>
  
  <xsl:variable name="element">
    <xsl:choose>
      <xsl:when test="$target!=''">a</xsl:when>
      <xsl:when test="$citation-title!=''">cite</xsl:when>
      <xsl:when test="($id!='' and $xml2rfc-ext-include-references-in-index='yes') or $title!=''">span</xsl:when>
      <xsl:otherwise/>
    </xsl:choose>
  </xsl:variable>
  
  <xsl:choose>
    <xsl:when test="$element!=''">
      <xsl:element name="{$element}">
        <xsl:if test="$target!=''">
          <xsl:attribute name="href"><xsl:value-of select="$target"/></xsl:attribute>
        </xsl:if>
        <xsl:if test="$element='cite' and $citation-title!=''">
          <xsl:attribute name="title"><xsl:value-of select="$citation-title"/></xsl:attribute>
        </xsl:if>
        <xsl:if test="$id!='' and $xml2rfc-ext-include-references-in-index='yes'">
          <xsl:attribute name="id"><xsl:value-of select="$id"/></xsl:attribute>
        </xsl:if>
        <xsl:if test="$title!=''">
          <xsl:attribute name="title"><xsl:value-of select="$title"/></xsl:attribute>
        </xsl:if>
        <xsl:choose>
          <xsl:when test="$element!='cite' and $citation-title!=''">
            <cite title="{$citation-title}">
              <xsl:choose>
                <xsl:when test="$child-nodes">
                  <xsl:apply-templates select="$child-nodes"/>
                </xsl:when>
                <xsl:otherwise>
                  <xsl:value-of select="$text"/>
                </xsl:otherwise>
              </xsl:choose>
            </cite>
          </xsl:when>
          <xsl:otherwise>
            <xsl:choose>
              <xsl:when test="$child-nodes">
                <xsl:apply-templates select="$child-nodes"/>
              </xsl:when>
              <xsl:otherwise>
                <xsl:value-of select="$text"/>
              </xsl:otherwise>
            </xsl:choose>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:element>
    </xsl:when>
    <xsl:otherwise>
      <xsl:choose>
        <xsl:when test="$child-nodes">
          <xsl:apply-templates select="$child-nodes"/>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="$text"/>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<!-- xref to reference -->
<xsl:template name="xref-to-reference">
  <xsl:param name="from"/>
  <xsl:param name="to"/>
  <xsl:param name="id"/>

  <xsl:variable name="front" select="$to/front[1]|document($to/x:source/@href)/rfc/front[1]"/>

  <xsl:variable name="is-xref" select="$from/self::xref"/>

  <xsl:variable name="sfmt">
    <xsl:for-each select="$from">
      <xsl:call-template name="get-section-xref-format">
        <xsl:with-param name="default">
          <xsl:choose>
            <xsl:when test="ancestor::artwork or ancestor::sourcecode">comma</xsl:when>
            <xsl:otherwise>of</xsl:otherwise>
          </xsl:choose>
        </xsl:with-param>
      </xsl:call-template>
    </xsl:for-each>
  </xsl:variable>

  <xsl:variable name="ssec">
    <xsl:for-each select="$from">
      <xsl:call-template name="get-section-xref-section"/>
    </xsl:for-each>
  </xsl:variable>

  <!-- check normative/informative -->
  <xsl:variable name="t-is-normative" select="$from/ancestor-or-self::*[@x:nrm][1]"/>
  <xsl:variable name="is-normative" select="$t-is-normative/@x:nrm='true'"/>
  <xsl:if test="count($to)=1 and $is-normative">
    <xsl:variable name="t-r-is-normative" select="$to/ancestor-or-self::*[@x:nrm][1]"/>
    <xsl:variable name="r-is-normative" select="$t-r-is-normative/@x:nrm='true'"/>
    <xsl:if test="not($r-is-normative)">
      <xsl:for-each select="$from">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg" select="concat('Potentially normative reference to ',$from/@target,' not referenced normatively')"/>
        </xsl:call-template>
      </xsl:for-each>
    </xsl:if>
  </xsl:if>

  <xsl:variable name="href">
    <xsl:call-template name="computed-target">
      <xsl:with-param name="bib" select="$to"/>
      <xsl:with-param name="ref" select="$from"/>
    </xsl:call-template>
  </xsl:variable>

  <xsl:variable name="tsec">
    <xsl:choose>
      <xsl:when test="starts-with($from/@x:rel,'#') and $ssec=''">
        <xsl:call-template name="compute-section-number">
          <xsl:with-param name="bib" select="$to"/>
          <xsl:with-param name="ref" select="$from"/>
        </xsl:call-template>
      </xsl:when>
      <xsl:when test="$from/@x:rel and not(starts-with($from/@x:rel,'#')) and $ssec=''">
        <xsl:call-template name="error">
          <xsl:with-param name="msg">x:rel attribute '<xsl:value-of select="$from/@x:rel"/>' in reference to <xsl:value-of select="$to/@anchor"/> is expected to start with '#'.</xsl:with-param>
        </xsl:call-template>
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="$ssec"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  
  <xsl:variable name="sec">
    <xsl:choose>
      <xsl:when test="contains($tsec,'@')">"<xsl:value-of select="substring-after($tsec,'@')"/>"</xsl:when>
      <xsl:otherwise><xsl:value-of select="$tsec"/></xsl:otherwise>
    </xsl:choose>
  </xsl:variable>

  <xsl:variable name="secterm">
    <xsl:choose>
      <!-- starts with letter or unnumbered? -->
      <xsl:when test="translate(substring($sec,1,1),$ucase,'')='' or starts-with($tsec,'A@')">Appendix</xsl:when>
      <xsl:otherwise>Section</xsl:otherwise>
    </xsl:choose>
  </xsl:variable>

  <xsl:variable name="title">
    <xsl:choose>
      <xsl:when test="starts-with($from/@x:rel,'#') and $ssec='' and $to/x:source/@href">
        <xsl:variable name="extdoc" select="document($to/x:source/@href)"/>
        <xsl:variable name="anch" select="substring-after($from//@x:rel,'#')"/>
        <xsl:variable name="nodes" select="$extdoc//*[@anchor=$anch or x:anchor-alias/@value=$anch]"/>
        <xsl:if test="not($nodes)">
          <xsl:call-template name="error">
            <xsl:with-param name="msg">Anchor '<xsl:value-of select="substring-after($from//@x:rel,'#')"/>' not found in <xsl:value-of select="$to/x:source/@href"/>.</xsl:with-param>
          </xsl:call-template>
        </xsl:if>
        <xsl:for-each select="$nodes">
          <xsl:value-of select="@title"/>
        </xsl:for-each>
      </xsl:when>
      <xsl:otherwise />
    </xsl:choose>
  </xsl:variable>

  <!--
  Formats:

    parens  [XXXX] (Section SS)
    comma   [XXXX], Section SS
    of      Section SS of [XXXX]
    sec     Section SS
    number  SS
  -->

  <xsl:if test="$sfmt!='' and not($sfmt='of' or $sfmt='section' or $sfmt='bare' or $sfmt='parens' or $sfmt='comma')">
    <xsl:call-template name="error">
      <xsl:with-param name="msg" select="concat('unknown xref section format extension: ',$sfmt)"/>
    </xsl:call-template>
  </xsl:if>

  <xsl:if test="$sec!=''">
    <xsl:choose>
      <xsl:when test="$sfmt='of'">
        <xsl:call-template name="emit-link">
          <xsl:with-param name="target" select="$href"/>
          <xsl:with-param name="text" select="concat($secterm,' ',$sec)"/>
          <xsl:with-param name="title" select="$title"/>
        </xsl:call-template>
        <xsl:text> of </xsl:text>
      </xsl:when>
      <xsl:when test="$sfmt='section'">
        <xsl:call-template name="emit-link">
          <xsl:with-param name="target" select="$href"/>
          <xsl:with-param name="text" select="concat($secterm,' ',$sec)"/>
          <xsl:with-param name="title" select="$title"/>
          <xsl:with-param name="id">
            <xsl:if test="$sfmt='section'">
              <xsl:value-of select="$id"/>
            </xsl:if>
          </xsl:with-param>
          <xsl:with-param name="index-item" select="$from/@target"/>
          <xsl:with-param name="index-subitem" select="$sec"/>
        </xsl:call-template>
      </xsl:when>
      <xsl:when test="$sfmt='bare'">
        <xsl:call-template name="emit-link">
          <xsl:with-param name="target" select="$href"/>
          <xsl:with-param name="text" select="$sec"/>
          <xsl:with-param name="title" select="$title"/>
          <xsl:with-param name="id" select="$id"/>
          <xsl:with-param name="index-item" select="$from/@target"/>
          <xsl:with-param name="index-subitem" select="$sec"/>
        </xsl:call-template>
      </xsl:when>
      <xsl:otherwise />
    </xsl:choose>
  </xsl:if>

  <xsl:if test="$sec='' or ($sfmt!='section' and $sfmt!='bare')">
    <xsl:call-template name="emit-link">
      <xsl:with-param name="target" select="concat('#',$from/@target)"/>
      <xsl:with-param name="text">
        <xsl:variable name="val">
          <xsl:call-template name="reference-name">
            <xsl:with-param name="node" select="$to" />
          </xsl:call-template>
        </xsl:variable>
        <xsl:choose>
          <xsl:when test="$is-xref and $from/@format='none'">
            <!-- nothing to do here -->
          </xsl:when>
          <xsl:when test="$is-xref and $from/@format='counter'">
            <xsl:call-template name="error">
              <xsl:with-param name="inline">no</xsl:with-param>
              <xsl:with-param name="msg">xref to reference with format='counter' not allowed</xsl:with-param>
            </xsl:call-template>
            <!-- remove brackets -->
            <xsl:value-of select="substring($val,2,string-length($val)-2)"/>
          </xsl:when>
          <xsl:when test="$is-xref and $from/@format='title'">
            <xsl:choose>
              <xsl:when test="$to/self::referencegroup">
                <xsl:value-of select="$to/@anchor"/>
              </xsl:when>
              <xsl:otherwise>
                <xsl:apply-templates select="$front[1]/title/node()" mode="get-text-content"/>
              </xsl:otherwise>
            </xsl:choose>
          </xsl:when>
          <xsl:otherwise>
            <xsl:if test="not($is-xref) and $from/@format">
              <xsl:call-template name="warning">
                <xsl:with-param name="msg">@format attribute is undefined for relref</xsl:with-param>
              </xsl:call-template>
            </xsl:if>
            <xsl:value-of select="$val"/>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:with-param>
      <xsl:with-param name="id" select="$id"/>
      <xsl:with-param name="index-item" select="$from/@target"/>
      <xsl:with-param name="index-subitem" select="$sec"/>
      <xsl:with-param name="citation-title" select="normalize-space($front[1]/title)"/>
    </xsl:call-template>
  </xsl:if>

  <xsl:if test="$sec!=''">
    <xsl:choose>
      <xsl:when test="$sfmt='parens'">
        <xsl:text> (</xsl:text>
        <xsl:call-template name="emit-link">
          <xsl:with-param name="target" select="$href"/>
          <xsl:with-param name="text" select="concat($secterm,' ',$sec)"/>
          <xsl:with-param name="title" select="$title"/>
        </xsl:call-template>
        <xsl:text>)</xsl:text>
      </xsl:when>
      <xsl:when test="$sfmt='comma'">
        <xsl:text>, </xsl:text>
        <xsl:call-template name="emit-link">
          <xsl:with-param name="target" select="$href"/>
          <xsl:with-param name="text" select="concat($secterm,' ',$sec)"/>
          <xsl:with-param name="title" select="$title"/>
        </xsl:call-template>
      </xsl:when>
      <xsl:otherwise/>
    </xsl:choose>
  </xsl:if>
  
</xsl:template>

<xsl:template name="get-target-anchor">
  <xsl:variable name="xref" select="."/>
  <xsl:for-each select="$src">
    <xsl:variable name="tn" select="key('anchor-item',$xref/@target)|exslt:node-set($includeDirectives)//reference[@anchor=$xref/@target]"/>
    <xsl:for-each select="$src">
      <xsl:choose>
        <xsl:when test="$tn/parent::artset and $tn/../@anchor">
          <xsl:value-of select="$tn/../@anchor"/>
        </xsl:when>
        <xsl:when test="$tn/parent::artset and $tn/../artwork/@anchor">
          <xsl:value-of select="$tn/../artwork[@anchor][1]/@anchor"/>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="$xref/@target"/>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:for-each>
  </xsl:for-each>
</xsl:template>

<xsl:template match="xref[not(*|text())]|relref[not(*|text())]">

  <xsl:variable name="xref" select="."/>

  <xsl:variable name="target">
    <xsl:call-template name="get-target-anchor"/>
  </xsl:variable>

  <xsl:if test="@target!=$target">
    <xsl:call-template name="info">
      <xsl:with-param name="msg">Target '<xsl:value-of select="@target"/>' rewritten to '<xsl:value-of select="$target"/>'.</xsl:with-param>
    </xsl:call-template>
  </xsl:if>

  <xsl:variable name="anchor"><xsl:value-of select="$anchor-pref"/>xref.<xsl:value-of select="$target"/>.<xsl:number level="any" count="xref[@target=$target]|relref[@target=$target]"/></xsl:variable>
  
  <!-- ensure we have the right context, this <xref> may be processed from within the boilerplate -->
  <xsl:for-each select="$src">

    <xsl:variable name="node" select="key('anchor-item',$target)|exslt:node-set($includeDirectives)//*[self::reference or self::referencegroup][@anchor=$target]"/>
    <xsl:if test="count($node)=0 and not($node/ancestor::ed:del)">
      <xsl:for-each select="$xref">
        <xsl:choose>
          <xsl:when test="not($xref/@target)">
            <xsl:variable name="present">
              <xsl:for-each select="$xref/@*">
                <xsl:text> @</xsl:text>
                <xsl:value-of select="local-name(.)"/>
              </xsl:for-each>
            </xsl:variable>
            <xsl:call-template name="error">
              <xsl:with-param name="msg">Undefined target: no @target attribute specified<xsl:if test="$present!=''"> (attributes found:<xsl:value-of select="$present"/>)</xsl:if></xsl:with-param>
            </xsl:call-template>
          </xsl:when>
          <xsl:otherwise>
            <xsl:call-template name="error">
              <xsl:with-param name="msg">Undefined target: '<xsl:value-of select="$xref/@target"/>'</xsl:with-param>
            </xsl:call-template>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:for-each>
    </xsl:if>

    <xsl:choose>

      <!-- Section links -->
      <xsl:when test="$node/self::section or $node/self::appendix or $node/self::references or $node/self::abstract or $node/self::note">
        <!-- index links to this xref -->
        <xsl:variable name="ireftargets" select="key('iref-xanch',$target) | key('iref-xanch','')[../@anchor=$target]"/>
        
        <xsl:call-template name="xref-to-section">
          <xsl:with-param name="from" select="$xref"/>
          <xsl:with-param name="to" select="$node"/>
          <xsl:with-param name="id" select="$anchor"/>
          <xsl:with-param name="irefs" select="$ireftargets"/>
        </xsl:call-template>
      </xsl:when>

      <!-- Figure links -->
      <xsl:when test="$node/self::figure">
        <xsl:call-template name="xref-to-figure">
          <xsl:with-param name="from" select="$xref"/>
          <xsl:with-param name="to" select="$node"/>
        </xsl:call-template>
      </xsl:when>

      <!-- Table links -->
      <xsl:when test="$node/self::texttable or $node/self::table">
        <xsl:call-template name="xref-to-table">
          <xsl:with-param name="from" select="$xref"/>
          <xsl:with-param name="to" select="$node"/>
        </xsl:call-template>
      </xsl:when>

      <!-- Paragraph links -->
      <xsl:when test="$node/self::t or $node/self::aside or $node/self::x:note or $node/self::blockquote or $node/self::x:blockquote or $node/self::dl or $node/self::ol or $node/self::ul or $node/self::dd or $node/self::dt or $node/self::li or $node/self::artwork or $node/self::sourcecode or $node/self::artset">
        <xsl:call-template name="xref-to-paragraph">
          <xsl:with-param name="from" select="$xref"/>
          <xsl:with-param name="to" select="$node"/>
          <xsl:with-param name="anchor" select="$target"/>
        </xsl:call-template>
      </xsl:when>

      <!-- Comment links -->
      <xsl:when test="$node/self::cref">
        <xsl:choose>
          <xsl:when test="$node/@display='false'">
            <xsl:for-each select="$xref">
              <xsl:call-template name="error">
                <xsl:with-param name="msg" select="concat('Comment ',$node/@anchor,' is hidden and thus can not be referenced')"/>
              </xsl:call-template>
            </xsl:for-each>
          </xsl:when>
          <xsl:when test="$xml2rfc-comments!='no'">
            <xsl:call-template name="xref-to-comment">
              <xsl:with-param name="from" select="$xref"/>
              <xsl:with-param name="to" select="$node"/>
            </xsl:call-template>
          </xsl:when>
          <xsl:otherwise>
            <xsl:for-each select="$xref">
              <xsl:call-template name="error">
                <xsl:with-param name="msg">xref to cref, but comments aren't included in the output</xsl:with-param>
              </xsl:call-template>
            </xsl:for-each>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:when>

      <!-- Reference links -->
      <xsl:when test="$node/self::reference or $node/self::referencegroup">
        <xsl:call-template name="xref-to-reference">
          <xsl:with-param name="from" select="$xref"/>
          <xsl:with-param name="to" select="$node"/>
          <xsl:with-param name="id" select="$anchor"/>
        </xsl:call-template>
      </xsl:when>

      <xsl:otherwise>
        <xsl:if test="$node">
          <!-- make it the correct context -->
          <xsl:for-each select="$xref">
            <xsl:call-template name="error">
              <xsl:with-param name="msg" select="concat('xref to unknown element: ',name($node))"/>
            </xsl:call-template>
          </xsl:for-each>
        </xsl:if>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:for-each>
</xsl:template>


<!-- mark unmatched elements red -->

<xsl:template match="*">
  <xsl:call-template name="error">
    <xsl:with-param name="inline" select="'no'"/>
    <xsl:with-param name="msg">no XSLT template for element '<xsl:value-of select="name()"/>'</xsl:with-param>
  </xsl:call-template>
  <span class="tt {$css-error}">&lt;<xsl:value-of select="name()" />&gt;</span>
  <xsl:copy><xsl:apply-templates select="node()|@*" /></xsl:copy>
  <span class="tt {$css-error}">&lt;/<xsl:value-of select="name()" />&gt;</span>
</xsl:template>

<xsl:template match="/">
  <xsl:apply-templates select="*" mode="validate"/>
  <xsl:apply-templates select="*" />
</xsl:template>

<!-- utility templates -->

<xsl:template name="collectLeftHeaderColumn">
  <!-- default case -->
  <xsl:if test="$xml2rfc-private=''">
    <xsl:if test="count(/rfc/front/workgroup)>1">
      <xsl:call-template name="error">
        <xsl:with-param name="inline">no</xsl:with-param>
        <xsl:with-param name="msg">There are multiple /rfc/front/workgroup elements; ignoring all but the first</xsl:with-param>
      </xsl:call-template>
    </xsl:if>
    <xsl:for-each select="/rfc/front/workgroup">
      <xsl:variable name="v" select="normalize-space(.)"/>
      <xsl:if test="translate($v, $ucase, $lcase)='internet engineering task force' or $v=''">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg">'<xsl:value-of select="$v"/>' definitively is not the name of a Working Group</xsl:with-param>
        </xsl:call-template>
      </xsl:if>
    </xsl:for-each>
    <xsl:choose>
      <xsl:when test="$is-rfc and $header-format='2010' and $submissionType='independent'">
        <myns:item>Independent Submission</myns:item>
      </xsl:when>
      <xsl:when test="$is-rfc and $header-format='2010' and $submissionType='IETF'">
        <myns:item>Internet Engineering Task Force (IETF)</myns:item>
      </xsl:when>
      <xsl:when test="$is-rfc and $header-format='2010' and $submissionType='IRTF'">
        <myns:item>Internet Research Task Force (IRTF)</myns:item>
      </xsl:when>
      <xsl:when test="$is-rfc and $header-format='2010' and $submissionType='IAB'">
        <myns:item>Internet Architecture Board (IAB)</myns:item>
      </xsl:when>
      <xsl:when test="/rfc/front/workgroup and (not($is-rfc) or $rfcno='')">
        <xsl:choose>
          <xsl:when test="starts-with(/rfc/@docName,'draft-ietf-') and $submissionType='IETF'"/>
          <xsl:when test="starts-with(/rfc/@docName,'draft-irft-') and $submissionType='IRTF'"/>
          <xsl:otherwise>
            <xsl:call-template name="info">
              <xsl:with-param name="msg">The /rfc/front/workgroup should only be used for Working/Research Group drafts</xsl:with-param>
            </xsl:call-template>
          </xsl:otherwise>
        </xsl:choose>
        <xsl:for-each select="/rfc/front/workgroup">
          <xsl:variable name="v" select="normalize-space(.)"/>
          <xsl:variable name="tmp" select="translate($v, $ucase, $lcase)"/>
          <xsl:if test="contains($tmp,' research group') or contains($tmp,' working group')">
            <xsl:call-template name="info">
              <xsl:with-param name="msg">No need to include 'Working Group' or 'Research Group' postfix in /rfc/front/workgroup value '<xsl:value-of select="$v"/>'</xsl:with-param>
            </xsl:call-template>
          </xsl:if>
          <xsl:variable name="h">
            <!-- when a single name, append WG/RG postfix automatically -->
            <xsl:choose>
              <xsl:when test="not(contains($v, ' ')) and starts-with(/rfc/@docName,'draft-ietf-') and $submissionType='IETF'">
                <xsl:value-of select="concat($v, ' Working Group')"/>
              </xsl:when>
              <xsl:when test="not(contains($v, ' ')) and starts-with(/rfc/@docName,'draft-irtf-') and $submissionType='IRTF'">
                <xsl:value-of select="concat($v, ' Research Group')"/>
              </xsl:when>
              <xsl:otherwise>
                <xsl:value-of select="$v"/>
              </xsl:otherwise>
            </xsl:choose>
          </xsl:variable>
          <myns:item>
            <xsl:value-of select="$h"/>
          </myns:item>
        </xsl:for-each>
      </xsl:when>
      <xsl:otherwise>
        <xsl:if test="starts-with(/rfc/@docName,'draft-ietf-') and not(/rfc/front/workgroup)">
          <xsl:call-template name="info">
            <xsl:with-param name="msg">WG submissions should include a /rfc/front/workgroup element</xsl:with-param>
          </xsl:call-template>
        </xsl:if>
        <myns:item>Network Working Group</myns:item>
      </xsl:otherwise>
    </xsl:choose>
    <!-- check <area> value -->
    <xsl:for-each select="/rfc/front/area">
      <xsl:variable name="area" select="normalize-space(.)"/>
      <xsl:variable name="rallowed">
        <xsl:if test="$pub-yearmonth &lt; 201509">
          <ed:v>Applications</ed:v>
          <ed:v>app</ed:v>
        </xsl:if>
        <xsl:if test="$pub-yearmonth &gt; 201505">
          <ed:v>Applications and Real-Time</ed:v>
          <ed:v>art</ed:v>
        </xsl:if>
        <ed:v>General</ed:v>
        <ed:v>gen</ed:v>
        <ed:v>Internet</ed:v>
        <ed:v>int</ed:v>
        <ed:v>Operations and Management</ed:v>
        <ed:v>ops</ed:v>
        <xsl:if test="$pub-yearmonth &lt; 201509">
          <ed:v>Real-time Applications and Infrastructure</ed:v>
          <ed:v>rai</ed:v>
        </xsl:if>
        <ed:v>Routing</ed:v>
        <ed:v>rtg</ed:v>
        <ed:v>Security</ed:v>
        <ed:v>sec</ed:v>
        <ed:v>Transport</ed:v>
        <ed:v>tsv</ed:v>
      </xsl:variable>
      <xsl:variable name="allowed" select="exslt:node-set($rallowed)"/>
      <xsl:choose>
        <xsl:when test="$allowed/ed:v=$area">
          <!-- ok -->
        </xsl:when>
        <xsl:otherwise>
          <xsl:call-template name="warning">
            <xsl:with-param name="msg">Unknown IETF area: "<xsl:value-of select="$area"/>" - should be one of: <xsl:for-each select="$allowed/ed:v">
              <xsl:text>"</xsl:text>
              <xsl:value-of select="."/>
              <xsl:text>"</xsl:text>
              <xsl:if test="position()!=last()">
                <xsl:text>, </xsl:text>
              </xsl:if>
            </xsl:for-each>
            <xsl:text> (as of the publication date of </xsl:text>
            <xsl:value-of select="$pub-yearmonth"/>
            <xsl:text>)</xsl:text>
            </xsl:with-param>
          </xsl:call-template>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:for-each>
    <myns:item>
       <xsl:choose>
        <xsl:when test="/rfc/@ipr and not($is-rfc)">Internet-Draft</xsl:when>
        <xsl:otherwise>
          <xsl:text>Request for Comments: </xsl:text>
          <xsl:value-of select="$rfcno"/>
        </xsl:otherwise>
      </xsl:choose>
    </myns:item>
    <xsl:if test="/rfc/@obsoletes!=''">
      <myns:item>
        <xsl:text>Obsoletes: </xsl:text>
        <xsl:call-template name="rfclist">
          <xsl:with-param name="list" select="normalize-space(/rfc/@obsoletes)" />
        </xsl:call-template>
        <xsl:if test="not($is-rfc)"> (if approved)</xsl:if>
      </myns:item>
    </xsl:if>
    <xsl:if test="/rfc/@seriesNo">
       <myns:item>
        <xsl:choose>
          <xsl:when test="/rfc/@category='bcp'">
            <xsl:text>BCP: </xsl:text>
            <xsl:value-of select="/rfc/@seriesNo"/>
            <xsl:for-each select="/rfc/front/seriesInfo[@name='BCP']">
              <xsl:if test="number(@value) != number(/rfc/@seriesNo)">
                <xsl:call-template name="error">
                  <xsl:with-param name="msg">BCP number given in /rfc/front/seriesInfo (<xsl:value-of select="@value"/>) inconsistent with rfc element (<xsl:value-of select="/rfc/@seriesNo"/>)</xsl:with-param>
                </xsl:call-template>
              </xsl:if>
            </xsl:for-each>
          </xsl:when>
          <xsl:when test="/rfc/@category='info'">
            <xsl:text>FYI: </xsl:text>
            <xsl:value-of select="/rfc/@seriesNo"/>
            <xsl:for-each select="/rfc/front/seriesInfo[@name='FYI']">
              <xsl:if test="number(@value) != number(/rfc/@seriesNo)">
                <xsl:call-template name="error">
                  <xsl:with-param name="msg">FYI number given in /rfc/front/seriesInfo (<xsl:value-of select="@value"/>) inconsistent with rfc element (<xsl:value-of select="/rfc/@seriesNo"/>)</xsl:with-param>
                </xsl:call-template>
              </xsl:if>
            </xsl:for-each>
          </xsl:when>
          <xsl:when test="/rfc/@category='std'">
            <xsl:text>STD: </xsl:text>
            <xsl:value-of select="/rfc/@seriesNo"/>
            <xsl:for-each select="/rfc/front/seriesInfo[@name='STD']">
              <xsl:if test="number(@value) != number(/rfc/@seriesNo)">
                <xsl:call-template name="error">
                  <xsl:with-param name="msg">STD number given in /rfc/front/seriesInfo (<xsl:value-of select="@value"/>) inconsistent with rfc element (<xsl:value-of select="/rfc/@seriesNo"/>)</xsl:with-param>
                </xsl:call-template>
              </xsl:if>
            </xsl:for-each>
          </xsl:when>
          <xsl:otherwise>
            <xsl:call-template name="warning">
              <xsl:with-param name="msg">There is no IETF document series called '<xsl:value-of select="/rfc/@category"/>'</xsl:with-param>
            </xsl:call-template>
            <xsl:value-of select="concat(translate(/rfc/@category,$lcase,$ucase),': ',/rfc/@seriesNo)" />
          </xsl:otherwise>
        </xsl:choose>
      </myns:item>
    </xsl:if>
    <xsl:if test="/rfc/@updates!=''">
      <myns:item>
        <xsl:text>Updates: </xsl:text>
          <xsl:call-template name="rfclist">
             <xsl:with-param name="list" select="normalize-space(/rfc/@updates)" />
          </xsl:call-template>
          <xsl:if test="not($is-rfc)"> (if approved)</xsl:if>
      </myns:item>
    </xsl:if>
    <myns:item>
      <xsl:choose>
        <xsl:when test="$is-rfc">
          <xsl:text>Category: </xsl:text>
        </xsl:when>
        <xsl:otherwise>
          <xsl:text>Intended status: </xsl:text>
        </xsl:otherwise>
      </xsl:choose>
      <xsl:call-template name="get-category-long" />
    </myns:item>
    <xsl:if test="/rfc/@ipr and not($is-rfc)">
       <myns:item>Expires: <xsl:call-template name="expirydate" /></myns:item>
    </xsl:if>
  </xsl:if>

  <!-- private case -->
  <xsl:if test="$xml2rfc-private!=''">
    <myns:item><xsl:value-of select="$xml2rfc-private" /></myns:item>
  </xsl:if>

  <xsl:if test="$header-format='2010' and $is-rfc">
    <myns:item>ISSN: 2070-1721</myns:item>
  </xsl:if>
</xsl:template>

<!-- author name handling -->

<xsl:template name="get-surname-from-fullname">
  <xsl:param name="s"/>
  <xsl:variable name="n" select="normalize-space($s)"/>
  <xsl:choose>
    <xsl:when test="contains($n,' ')">
      <xsl:call-template name="get-surname-from-fullname">
        <xsl:with-param name="s" select="substring-after($n,' ')"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="$n"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="get-author-surname">
  <xsl:variable name="s" select="normalize-space(@surname)"/>
  <xsl:choose>
    <xsl:when test="$s='' and normalize-space(@fullname)!=''">
      <xsl:variable name="computed">
        <xsl:call-template name="get-surname-from-fullname">
          <xsl:with-param name="s" select="@fullname"/>
        </xsl:call-template>
      </xsl:variable>
      <xsl:call-template name="info">
        <xsl:with-param name="msg">author/@surname is missing for author with fullname '<xsl:value-of select="@fullname"/>', extracted as '<xsl:value-of select="normalize-space($computed)"/>'</xsl:with-param>
      </xsl:call-template>
      <xsl:value-of select="normalize-space($computed)"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="$s"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="get-initials-from-fullname">
  <xsl:param name="s"/>
  <xsl:variable name="n" select="normalize-space($s)"/>
  <xsl:choose>
    <xsl:when test="contains($n,' ')">
      <xsl:value-of select="substring($n,1,1)"/><xsl:text>. </xsl:text>
      <xsl:call-template name="get-initials-from-fullname">
        <xsl:with-param name="s" select="substring-after($n,' ')"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise/>
  </xsl:choose>
</xsl:template>

<xsl:template name="get-author-initials">
  <xsl:variable name="s" select="normalize-space(@initials)"/>
  <xsl:choose>
    <xsl:when test="$s='' and normalize-space(@fullname)!='' and normalize-space(@surname)=''">
      <xsl:variable name="computed">
        <xsl:call-template name="get-initials-from-fullname">
          <xsl:with-param name="s" select="@fullname"/>
        </xsl:call-template>
      </xsl:variable>
      <xsl:call-template name="info">
        <xsl:with-param name="msg">author/@initials is missing for author with fullname '<xsl:value-of select="@fullname"/>', extracted as '<xsl:value-of select="normalize-space($computed)"/>'</xsl:with-param>
      </xsl:call-template>
      <xsl:value-of select="normalize-space($computed)"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="$s"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="collectRightHeaderColumn">
  <xsl:for-each select="author">
    <xsl:variable name="surname">
      <xsl:call-template name="get-author-surname"/>
    </xsl:variable>
    <xsl:variable name="rawinitials">
      <xsl:call-template name="get-author-initials"/>
    </xsl:variable>
    <xsl:variable name="initials">
      <xsl:call-template name="format-initials">
        <xsl:with-param name="initials" select="$rawinitials"/>
      </xsl:call-template>
    </xsl:variable>
    <xsl:variable name="truncated-initials">
      <xsl:call-template name="truncate-initials">
        <xsl:with-param name="initials" select="$initials"/>
      </xsl:call-template>
    </xsl:variable>
    <xsl:if test="$surname!=''">
      <myns:item>
        <xsl:value-of select="$truncated-initials"/>
        <xsl:if test="$truncated-initials!=''">
          <xsl:text> </xsl:text>
        </xsl:if>
        <xsl:value-of select="$surname" />
        <xsl:if test="@asciiInitials!='' or @asciiSurname!=''">
          <xsl:text> (</xsl:text>
            <xsl:value-of select="@asciiInitials"/>
            <xsl:if test="@asciiInitials!='' and @asciiSurname!=''"> </xsl:if>
            <xsl:value-of select="@asciiSurname"/>
          <xsl:text>)</xsl:text>
        </xsl:if>
        <xsl:if test="@role">
          <xsl:choose>
            <xsl:when test="@role='editor'">
              <xsl:text>, Editor</xsl:text>
            </xsl:when>
            <xsl:otherwise>
              <xsl:text>, </xsl:text><xsl:value-of select="@role" />
            </xsl:otherwise>
          </xsl:choose>
        </xsl:if>
      </myns:item>
    </xsl:if>
    <xsl:variable name="org">
      <xsl:choose>
        <xsl:when test="organization/@showOnFrontPage='false'"/>
        <xsl:when test="organization/@abbrev"><xsl:value-of select="organization/@abbrev"/></xsl:when>
        <xsl:otherwise><xsl:value-of select="organization"/></xsl:otherwise>
      </xsl:choose>
    </xsl:variable>
    <xsl:variable name="orgOfFollowing">
      <xsl:choose>
        <xsl:when test="following-sibling::*[1]/organization/@showOnFrontPage='false'"/>
        <xsl:when test="following-sibling::*[1]/organization/@abbrev"><xsl:value-of select="following-sibling::*[1]/organization/@abbrev" /></xsl:when>
        <xsl:otherwise><xsl:value-of select="following-sibling::*/organization" /></xsl:otherwise>
      </xsl:choose>
    </xsl:variable>
    <xsl:if test="$org != $orgOfFollowing and $org != ''">
      <myns:item>
        <xsl:value-of select="$org"/>
        <xsl:if test="organization/@ascii">
          <xsl:value-of select="concat(' (',organization/@ascii,')')"/>
        </xsl:if>
      </myns:item>
    </xsl:if>
  </xsl:for-each>
  <myns:item>
    <xsl:if test="$xml2rfc-ext-pub-month!=''">
      <xsl:if test="$xml2rfc-ext-pub-day!='' and /rfc/front/date/@x:include-day='true' and $is-rfc">
        <xsl:value-of select="number($xml2rfc-ext-pub-day)" />
        <xsl:text> </xsl:text>
      </xsl:if>
      <xsl:value-of select="$xml2rfc-ext-pub-month" />
      <xsl:if test="$xml2rfc-ext-pub-day!='' and /rfc/@ipr and not($is-rfc)">
        <xsl:text> </xsl:text>
        <xsl:value-of select="number($xml2rfc-ext-pub-day)" />
        <xsl:text>,</xsl:text>
      </xsl:if>
    </xsl:if>
    <xsl:if test="$xml2rfc-ext-pub-month='' and $rfcno!=''">
      <xsl:call-template name="error">
        <xsl:with-param name="msg" select="'month missing but is required for RFCs'"/>
      </xsl:call-template>
    </xsl:if>
    <xsl:if test="$xml2rfc-ext-pub-day='' and /rfc/@docName and $rfcno='' and not(substring(/rfc/@docName, string-length(/rfc/@docName) - string-length('-latest') + 1) = '-latest')">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg" select="concat('/rfc/front/date/@day appears to be missing for a historic draft dated ', $pub-yearmonth)"/>
      </xsl:call-template>
    </xsl:if>
    <xsl:value-of select="concat(' ',$xml2rfc-ext-pub-year)" />
  </myns:item>
</xsl:template>


<xsl:template name="emitheader">
  <xsl:param name="lc" />
  <xsl:param name="rc" />

  <tbody>
    <xsl:for-each select="$lc/myns:item | $rc/myns:item">
      <xsl:variable name="pos" select="position()" />
      <xsl:if test="$pos &lt; count($lc/myns:item) + 1 or $pos &lt; count($rc/myns:item) + 1">
        <tr>
          <td class="{$css-left}"><xsl:call-template name="copynodes"><xsl:with-param name="nodes" select="$lc/myns:item[$pos]/node()" /></xsl:call-template></td>
          <td class="{$css-right}"><xsl:call-template name="copynodes"><xsl:with-param name="nodes" select="$rc/myns:item[$pos]/node()" /></xsl:call-template></td>
        </tr>
      </xsl:if>
    </xsl:for-each>
  </tbody>
</xsl:template>

<!-- convenience template that avoids copying namespace nodes we don't want -->
<xsl:template name="copynodes">
  <xsl:param name="nodes" />
  <xsl:for-each select="$nodes">
    <xsl:choose>
      <xsl:when test="namespace-uri()='http://www.w3.org/1999/xhtml'">
        <xsl:element name="{name()}" namespace="{namespace-uri()}">
          <xsl:copy-of select="@*|node()" />
        </xsl:element>
      </xsl:when>
      <xsl:when test="self::*">
        <xsl:element name="{name()}">
          <xsl:copy-of select="@*|node()" />
        </xsl:element>
      </xsl:when>
      <xsl:otherwise>
        <xsl:copy-of select="." />
      </xsl:otherwise>
    </xsl:choose>
  </xsl:for-each>
</xsl:template>


<xsl:template name="expirydate">
  <xsl:param name="in-prose"/>
  <xsl:choose>
    <xsl:when test="number($xml2rfc-ext-pub-day) >= 1">
      <!-- have day of month? -->
      <xsl:if test="$in-prose">
        <xsl:text>on </xsl:text>
      </xsl:if>
      <xsl:call-template name="normalize-date">
        <xsl:with-param name="year" select="$xml2rfc-ext-pub-year"/>
        <xsl:with-param name="month" select="$pub-month-numeric"/>
        <xsl:with-param name="day" select="$xml2rfc-ext-pub-day + 185"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:if test="$in-prose">
        <xsl:text>in </xsl:text>
      </xsl:if>
      <xsl:variable name="month">
        <xsl:call-template name="get-month-as-num">
          <xsl:with-param name="month" select="$xml2rfc-ext-pub-month"/>
        </xsl:call-template>
      </xsl:variable>
      <xsl:choose>
        <xsl:when test="string(number($month))!='NaN' and number($month) &gt; 0 and number($month) &lt; 7">
          <xsl:call-template name="get-month-as-name">
            <xsl:with-param name="month" select="number($month) + 6"/>
          </xsl:call-template>
          <xsl:text> </xsl:text>
          <xsl:value-of select="$xml2rfc-ext-pub-year" />
        </xsl:when>
        <xsl:when test="string(number($month))!='NaN' and number($month) &gt; 6 and number($month) &lt; 13">
          <xsl:call-template name="get-month-as-name">
            <xsl:with-param name="month" select="number($month) - 6"/>
          </xsl:call-template>
          <xsl:text> </xsl:text>
          <xsl:value-of select="$xml2rfc-ext-pub-year + 1" />
        </xsl:when>
        <xsl:otherwise>WRONG SYNTAX FOR MONTH</xsl:otherwise>
      </xsl:choose>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="normalize-date">
  <xsl:param name="year"/>
  <xsl:param name="month"/>
  <xsl:param name="day"/>

  <xsl:variable name="isleap" select="(($year mod 4) = 0 and ($year mod 100 != 0)) or ($year mod 400) = 0" />

  <!--<xsl:message>
    <xsl:value-of select="concat($year,' ',$month,' ',$day)"/>
  </xsl:message>-->

  <xsl:variable name="dim">
    <xsl:choose>
      <xsl:when test="$month=1 or $month=3 or $month=5 or $month=7 or $month=8 or $month=10 or $month=12">31</xsl:when>
      <xsl:when test="$month=2 and $isleap">29</xsl:when>
      <xsl:when test="$month=2 and not($isleap)">28</xsl:when>
      <xsl:otherwise>30</xsl:otherwise>
    </xsl:choose>
  </xsl:variable>

  <xsl:choose>
    <xsl:when test="$day > $dim and $month=12">
      <xsl:call-template name="normalize-date">
        <xsl:with-param name="year" select="$year + 1"/>
        <xsl:with-param name="month" select="1"/>
        <xsl:with-param name="day" select="$day - $dim"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:when test="$day > $dim">
      <xsl:call-template name="normalize-date">
        <xsl:with-param name="year" select="$year"/>
        <xsl:with-param name="month" select="$month + 1"/>
        <xsl:with-param name="day" select="$day - $dim"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="get-month-as-name">
        <xsl:with-param name="month" select="$month"/>
      </xsl:call-template>
      <xsl:value-of select="concat(' ',$day,', ',$year)"/>
    </xsl:otherwise>
  </xsl:choose>

</xsl:template>

<xsl:template name="get-month-as-num">
  <xsl:param name="month" />
  <xsl:choose>
    <xsl:when test="$month='January'">01</xsl:when>
    <xsl:when test="$month='February'">02</xsl:when>
    <xsl:when test="$month='March'">03</xsl:when>
    <xsl:when test="$month='April'">04</xsl:when>
    <xsl:when test="$month='May'">05</xsl:when>
    <xsl:when test="$month='June'">06</xsl:when>
    <xsl:when test="$month='July'">07</xsl:when>
    <xsl:when test="$month='August'">08</xsl:when>
    <xsl:when test="$month='September'">09</xsl:when>
    <xsl:when test="$month='October'">10</xsl:when>
    <xsl:when test="$month='November'">11</xsl:when>
    <xsl:when test="$month='December'">12</xsl:when>
    <xsl:otherwise>WRONG SYNTAX FOR MONTH</xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="get-month-as-name">
  <xsl:param name="month"/>
  <xsl:choose>
    <xsl:when test="$month=1">January</xsl:when>
    <xsl:when test="$month=2">February</xsl:when>
    <xsl:when test="$month=3">March</xsl:when>
    <xsl:when test="$month=4">April</xsl:when>
    <xsl:when test="$month=5">May</xsl:when>
    <xsl:when test="$month=6">June</xsl:when>
    <xsl:when test="$month=7">July</xsl:when>
    <xsl:when test="$month=8">August</xsl:when>
    <xsl:when test="$month=9">September</xsl:when>
    <xsl:when test="$month=10">October</xsl:when>
    <xsl:when test="$month=11">November</xsl:when>
    <xsl:when test="$month=12">December</xsl:when>
    <xsl:otherwise>WRONG SYNTAX FOR MONTH</xsl:otherwise>
   </xsl:choose>
</xsl:template>

<!-- produce back section with author information -->
<xsl:template name="get-authors-section-title">
  <xsl:choose>
    <xsl:when test="count(/rfc/front/author)=1">Author's Address</xsl:when>
    <xsl:otherwise>Authors' Addresses</xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="get-authors-section-number">
  <xsl:if test="/*/x:assign-section-number[@builtin-target='authors']">
    <xsl:value-of select="/*/x:assign-section-number[@builtin-target='authors']/@number"/>
  </xsl:if>
</xsl:template>

<xsl:template name="insertAuthors">

  <xsl:variable name="number">
    <xsl:call-template name="get-authors-section-number"/>
  </xsl:variable>

  <xsl:if test="$number!='suppress' and $xml2rfc-authorship!='no'">
    <xsl:call-template name="insert-conditional-hrule"/>

    <section id="{$anchor-pref}authors" class="avoidbreakinside">
      <xsl:call-template name="insert-conditional-pagebreak"/>
      <h2>
        <xsl:if test="$number != ''">
          <a href="#{$anchor-pref}section.{$number}" id="{$anchor-pref}section.{$number}"><xsl:value-of select="$number"/>.</a>
          <xsl:text> </xsl:text>
        </xsl:if>
        <a href="#{$anchor-pref}authors"><xsl:call-template name="get-authors-section-title"/></a>
      </h2>

      <xsl:apply-templates select="/rfc/front/author" />
    </section>
  </xsl:if>
</xsl:template>



<!-- insert copyright statement -->

<xsl:template name="insertCopyright" myns:namespaceless-elements="xml2rfc">

<boilerplate>
  <xsl:if test="not($no-copylong)">
    <section title="Full Copyright Statement" anchor="{$anchor-pref}copyright" x:fixed-section-number="3">
      <xsl:choose>
        <xsl:when test="$ipr-rfc3667">
          <t>
            <xsl:choose>
              <xsl:when test="$ipr-rfc4748">
                Copyright &#169; The IETF Trust (<xsl:value-of select="$xml2rfc-ext-pub-year" />).
              </xsl:when>
              <xsl:otherwise>
                Copyright &#169; The Internet Society (<xsl:value-of select="$xml2rfc-ext-pub-year" />).
              </xsl:otherwise>
            </xsl:choose>
          </t>
          <t>
            This document is subject to the rights, licenses and restrictions
            contained in BCP 78<xsl:if test="$submissionType='independent'"> and at <eref target="http://www.rfc-editor.org/copyright.html">http://www.rfc-editor.org/copyright.html</eref></xsl:if>, and except as set forth therein, the authors
            retain all their rights.
          </t>
          <t>
            This document and the information contained herein are provided
            on an &#8220;AS IS&#8221; basis and THE CONTRIBUTOR,
            THE ORGANIZATION HE/SHE REPRESENTS OR IS SPONSORED BY (IF ANY),
            THE INTERNET SOCIETY<xsl:if test="$ipr-rfc4748">, THE IETF TRUST</xsl:if>
            AND THE INTERNET ENGINEERING TASK FORCE DISCLAIM ALL WARRANTIES,
            EXPRESS OR IMPLIED,
            INCLUDING BUT NOT LIMITED TO ANY WARRANTY THAT THE USE OF THE
            INFORMATION HEREIN WILL NOT INFRINGE ANY RIGHTS OR ANY IMPLIED
            WARRANTIES OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.
          </t>
        </xsl:when>
        <xsl:otherwise>
          <!-- <http://tools.ietf.org/html/rfc2026#section-10.4> -->
          <t>
            Copyright &#169; The Internet Society (<xsl:value-of select="$xml2rfc-ext-pub-year" />). All Rights Reserved.
          </t>
          <t>
            This document and translations of it may be copied and furnished to
            others, and derivative works that comment on or otherwise explain it
            or assist in its implementation may be prepared, copied, published and
            distributed, in whole or in part, without restriction of any kind,
            provided that the above copyright notice and this paragraph are
            included on all such copies and derivative works. However, this
            document itself may not be modified in any way, such as by removing
            the copyright notice or references to the Internet Society or other
            Internet organizations, except as needed for the purpose of
            developing Internet standards in which case the procedures for
            copyrights defined in the Internet Standards process must be
            followed, or as required to translate it into languages other than
            English.
          </t>
          <t>
            The limited permissions granted above are perpetual and will not be
            revoked by the Internet Society or its successors or assigns.
          </t>
          <t>
            This document and the information contained herein is provided on an
            &#8220;AS IS&#8221; basis and THE INTERNET SOCIETY AND THE INTERNET ENGINEERING
            TASK FORCE DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING
            BUT NOT LIMITED TO ANY WARRANTY THAT THE USE OF THE INFORMATION
            HEREIN WILL NOT INFRINGE ANY RIGHTS OR ANY IMPLIED WARRANTIES OF
            MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.
          </t>
        </xsl:otherwise>
      </xsl:choose>
    </section>

    <section title="Intellectual Property" anchor="{$anchor-pref}ipr" x:fixed-section-number="4">
      <xsl:choose>
        <xsl:when test="$ipr-rfc3667">
          <t>
            The IETF takes no position regarding the validity or scope of any
            Intellectual Property Rights or other rights that might be claimed to
            pertain to the implementation or use of the technology described in
            this document or the extent to which any license under such rights
            might or might not be available; nor does it represent that it has
            made any independent effort to identify any such rights.  Information
            on the procedures with respect to rights in RFC documents
            can be found in BCP 78 and BCP 79.
          </t>
          <t>
            Copies of IPR disclosures made to the IETF Secretariat and any
            assurances of licenses to be made available, or the result of an
            attempt made to obtain a general license or permission for the use
            of such proprietary rights by implementers or users of this
            specification can be obtained from the IETF on-line IPR repository
            at <eref target="http://www.ietf.org/ipr">http://www.ietf.org/ipr</eref>.
          </t>
          <t>
            The IETF invites any interested party to bring to its attention any
            copyrights, patents or patent applications, or other proprietary
            rights that may cover technology that may be required to implement
            this standard. Please address the information to the IETF at
            <eref target="mailto:ietf-ipr@ietf.org">ietf-ipr@ietf.org</eref>.
          </t>
        </xsl:when>
        <xsl:otherwise>
          <t>
            The IETF takes no position regarding the validity or scope of
            any intellectual property or other rights that might be claimed
            to  pertain to the implementation or use of the technology
            described in this document or the extent to which any license
            under such rights might or might not be available; neither does
            it represent that it has made any effort to identify any such
            rights. Information on the IETF's procedures with respect to
            rights in standards-track and standards-related documentation
            can be found in BCP-11. Copies of claims of rights made
            available for publication and any assurances of licenses to
            be made available, or the result of an attempt made
            to obtain a general license or permission for the use of such
            proprietary rights by implementors or users of this
            specification can be obtained from the IETF Secretariat.
          </t>
          <t>
            The IETF invites any interested party to bring to its
            attention any copyrights, patents or patent applications, or
            other proprietary rights which may cover technology that may be
            required to practice this standard. Please address the
            information to the IETF Executive Director.
          </t>
          <xsl:if test="$xml2rfc-iprnotified='yes'">
            <t>
              The IETF has been notified of intellectual property rights
              claimed in regard to some or all of the specification contained
              in this document. For more information consult the online list
              of claimed rights.
            </t>
          </xsl:if>
        </xsl:otherwise>
      </xsl:choose>
    </section>

    <xsl:choose>
      <xsl:when test="$no-funding"/>
      <xsl:when test="$funding1 and $is-rfc">
        <section x:fixed-section-number="5">
          <xsl:attribute name="title">
            <xsl:choose>
              <xsl:when test="$xml2rfc-rfcedstyle='yes'">Acknowledgement</xsl:when>
              <xsl:otherwise>Acknowledgment</xsl:otherwise>
            </xsl:choose>
          </xsl:attribute>
          <t>
            Funding for the RFC Editor function is provided by the IETF
            Administrative Support Activity (IASA).
          </t>
        </section>
      </xsl:when>
      <xsl:when test="$funding0 and $is-rfc">
        <section x:fixed-section-number="5">
          <xsl:attribute name="title">
            <xsl:choose>
              <xsl:when test="$xml2rfc-rfcedstyle='yes'">Acknowledgement</xsl:when>
              <xsl:otherwise>Acknowledgment</xsl:otherwise>
            </xsl:choose>
          </xsl:attribute>
          <t>
            Funding for the RFC Editor function is currently provided by
            the Internet Society.
          </t>
        </section>
      </xsl:when>
      <xsl:otherwise/>
    </xsl:choose>
  </xsl:if>
</boilerplate>
</xsl:template>

<!-- optional scripts -->
<xsl:template name="insertScripts">
<xsl:if test="$xml2rfc-ext-refresh-from!=''">
<script>
var RfcRefresh = {};
RfcRefresh.NS_XHTML = "http://www.w3.org/1999/xhtml";
RfcRefresh.NS_MOZERR = "http://www.mozilla.org/newlayout/xml/parsererror.xml";
RfcRefresh.lastTxt = "";
RfcRefresh.lastEtag = "";
RfcRefresh.xslt = null;
RfcRefresh.xmlsource = "<xsl:value-of select='$xml2rfc-ext-refresh-from'/>";
RfcRefresh.xsltsource = "<xsl:value-of select='$xml2rfc-ext-refresh-xslt'/>";
RfcRefresh.interval = "<xsl:value-of select='number($xml2rfc-ext-refresh-interval)'/>";

RfcRefresh.getXSLT = function() {
  if (! window.XSLTProcessor) {
    var err = document.createElement("pre");
    err.className = "refreshbrowsererror <xsl:value-of select="$css-noprint"/>";
    var msg = "This browser does not support the window.XSLTProcessor functionality.";
    err.appendChild(document.createTextNode(msg));
    RfcRefresh.showMessage("refreshxmlerror", err);
  }
  else {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", RfcRefresh.xsltsource, true);
      xhr.onload = function (e) {
        if (xhr.readyState === 4) {
          RfcRefresh.xslt = new XSLTProcessor();
          RfcRefresh.xslt.importStylesheet(xhr.responseXML);
        }
      }
      xhr.onerror = function (e) {
        console.error(xhr.status + " " + xhr.statusText);
      };
      xhr.send(null);
    }
    catch (e) {
      var err = document.createElement("pre");
      err.className = "refreshbrowsererror <xsl:value-of select="$css-noprint"/>";
      var msg = "Failed to load XSLT code from &lt;" + RfcRefresh.xsltsource + "&gt;.\n";
      msg += "Your browser might not support loading from a file: URI.\n";
      msg += "Error details: " + e;
      err.appendChild(document.createTextNode(msg));
      RfcRefresh.showMessage("refreshxmlerror", err);
    }
  }
}

RfcRefresh.findAndUpdate = function(olddoc, elem) {
  var changed = "";
  var children = elem.childNodes;
  for (var i = 0; i != children.length; i++) {
    var n = children[i];
    if (n.nodeType == 1) {
      var c = RfcRefresh.findAndUpdate(olddoc, n);
      if (changed == '') {
        changed = c;
      }
      var id = n.id;
      if (id != "") {
        var old = olddoc.getElementById(id);
        var newtext = n.innerHTML;
        if (!old) {
          console.debug("new " + id);
        } else {
          var oldtext = old.innerHTML;
          if (oldtext != newtext) {
            console.debug("updating " + id);
            old.innerHTML = n.innerHTML;
            if (changed == '') {
              changed = id;
            }
          }
        }
      }
    }
  }
  return changed;
}

RfcRefresh.findDifferences = function(olddoc, newdoc) {
  var changed = RfcRefresh.findAndUpdate(olddoc, newdoc.documentElement);
  if (changed != "") {
    console.debug("changed: " + changed);
    document.location = "#" + changed;
  }
  // final check for changes; if those were not processed earlier,
  // we refresh the whole document
  var oldtext = olddoc.documentElement.getElementsByTagName("body")[0].innerHTML;
  var newtext = newdoc.documentElement.getElementsByTagName("body")[0].innerHTML;
  if (oldtext != newtext) {
    console.debug("full refresh: " + newtext);
    olddoc.documentElement.innerHTML = newdoc.documentElement.innerHTML;
  }
}

RfcRefresh.getNodeText = function(elem) {
  var result = "";
  var children = elem.childNodes;
  for (var i = 0; i != children.length; i++) {
    if (children[i].nodeType == 3) {
      result += children[i].nodeValue;
    }
  }
  return result; 
}

RfcRefresh.getParserError = function(dom) {
  // FIREFOX
  if ("parsererror" == dom.documentElement.nodeName &amp;&amp; RfcRefresh.NS_MOZERR == dom.documentElement.namespaceURI) {
    var errmsg = new Object();
    errmsg.msg = "";
    errmsg.src = "";
    var children = dom.documentElement.childNodes;
    for (var i = 0; i != children.length; i++) {
      if (children[i].nodeType == 3) {
        errmsg.msg += children[i].nodeValue;
      } else if (children[i].nodeName == "sourcetext") {
        errmsg.src = RfcRefresh.getNodeText(children[i]);
      }
    }
    return errmsg;
  }
  
  var list = dom.getElementsByTagNameNS(RfcRefresh.NS_XHTML, "parsererror");
  if (list.length != 0) {
    // Webkit
    var errmsg = new Object();
    errmsg.msg = "XML parse error";
    list = dom.getElementsByTagNameNS(RfcRefresh.NS_XHTML, "div");
    if (list.length != 0) {
      errmsg.msg = RfcRefresh.getNodeText(list[0]);
    }
    return errmsg;
  }  
  
  
  return null;
}

RfcRefresh.showMessage = function(cls, node) {
  // remove previous message
  var list = document.getElementsByClassName(cls);
  if (list.length != 0) {
    list[0].parentNode.removeChild(list[0]);
  }
  document.body.appendChild(node);
}

RfcRefresh.refresh = function(txt) {
  if (txt != RfcRefresh.lastTxt) {
    RfcRefresh.lastTxt = txt;
    // try to parse
    var parser = new DOMParser();
    var dom = parser.parseFromString(txt, "text/xml");
    var errmsg = RfcRefresh.getParserError(dom);
    
    if (errmsg != null) {
      var err = document.createElement("pre");
      err.className = "refreshxmlerror <xsl:value-of select="$css-noprint"/>";
      err.appendChild(document.createTextNode(errmsg.msg));
      if (errmsg.src != null) {
        err.appendChild(document.createElement("hr"));
        err.appendChild(document.createTextNode(errmsg.src));
      }
      RfcRefresh.showMessage("refreshxmlerror", err);
    } else {
      // find new refresh
      var children = dom.childNodes;
      for (var i = 0; i != children.length; i++) {
        if (children[i].nodeType == 7 &amp;&amp; children[i].target == "rfc-ext") {
          var s = "&lt;foo " + children[i].data + "/>";
          var sd = parser.parseFromString(s, "text/xml");
          var refresh = sd.documentElement.getAttribute("refresh-interval");
          if (refresh != null &amp;&amp; refresh != "") {
            refresh = parseInt(refresh, 10);
            if (RfcRefresh.interval != refresh) {
              if (Number.isNaN(refresh) || refresh &lt; 5) {
                console.debug("refresh requested to be: " + refresh + " - ignored, using 5 instead.");
                RfcRefresh.interval = 5;
              } else {
                RfcRefresh.interval = refresh;
                console.debug("refresh changed to: " + refresh);
              }
            }
          }
        }
      }
    
      var html = RfcRefresh.xslt.transformToDocument(dom);
      RfcRefresh.findDifferences(document, html);
    }
  }
}

RfcRefresh.initRefresh = function() {
  RfcRefresh.getXSLT();
    
  window.setTimeout(function(){
    if (RfcRefresh.xslt != null) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", RfcRefresh.xmlsource, true);
      if (RfcRefresh.lastEtag != "") {
        xhr.setRequestHeader("If-None-Match", RfcRefresh.lastEtag);
      }
      xhr.onload = function (e) {
        if (xhr.readyState === 4) {
          console.debug(xhr.status + " " + xhr.statusText);
          if (xhr.status != 304) {
            RfcRefresh.refresh(xhr.responseText);
          }
          RfcRefresh.lastEtag = xhr.getResponseHeader("ETag");
        }
      }
      xhr.onerror = function (e) {
        console.error(xhr.status + " " + xhr.statusText);
      };
      xhr.send(null);
      setTimeout(arguments.callee, RfcRefresh.interval * 1000);
    }
  }, RfcRefresh.interval * 1000);
}
</script>
</xsl:if>
<xsl:if test="/rfc/x:feedback">
<script>
var buttonsAdded = false;

function initFeedback() {
  var fb = document.createElement("div");
  fb.className = "<xsl:value-of select="concat($css-feedback,' ',$css-noprint)"/>";
  fb.setAttribute("onclick", "feedback();");
  fb.appendChild(document.createTextNode("feedback"));

  document.body.appendChild(fb);
}

function feedback() {
  toggleButtonsToElementsByName("h2");
  toggleButtonsToElementsByName("h3");
  toggleButtonsToElementsByName("h4");
  toggleButtonsToElementsByName("h5");

  buttonsAdded = !buttonsAdded;
}

function toggleButtonsToElementsByName(name) {
  var list = document.getElementsByTagName(name);
  for (var i = 0; i &lt; list.length; i++) {
    toggleButton(list.item(i));
  }
}

function toggleButton(node) {
  if (! buttonsAdded) {

    // docname
    var template = "<xsl:call-template name="replace-substring">
  <xsl:with-param name="string" select="/rfc/x:feedback/@template"/>
  <xsl:with-param name="replace">"</xsl:with-param>
  <xsl:with-param name="by">\"</xsl:with-param>
</xsl:call-template>";

    var id = node.getAttribute("id");
    // try also parent
    if (id == null || id == "") {
      var id = node.parentNode.getAttribute("id");
    }
    // better id available?
    var titlelinks = node.getElementsByTagName("a");
    for (var i = 0; i &lt; titlelinks.length; i++) {
      var tl = titlelinks.item(i);
      if (tl.getAttribute("id")) {
        id = tl.getAttribute("id");
      }
    }
    
    // ref
    var ref = window.location.toString();
    var hash = ref.indexOf("#");
    if (hash != -1) {
      ref = ref.substring(0, hash);
    }
    if (id != null &amp;&amp; id != "") {
      ref += "#" + id;
    }

    // docname
    var docname = "<xsl:value-of select="/rfc/@docName"/>";

    // section
    var section = node.textContent;
    section = section.replace("\u00a0", " ").trim();

    // build URI from template
    var uri = template.replace("{docname}", encodeURIComponent(docname));
    uri = uri.replace("{section}", encodeURIComponent(section));
    uri = uri.replace("{ref}", encodeURIComponent(ref));

    var button = document.createElement("a");
    button.className = "<xsl:value-of select="concat($css-fbbutton,' ',$css-noprint)"/>";
    button.setAttribute("href", uri);
    button.appendChild(document.createTextNode("send feedback"));
    node.appendChild(button);
  }
  else {
    var buttons = node.getElementsByTagName("a");
    for (var i = 0; i &lt; buttons.length; i++) {
      var b = buttons.item(i);
      if (b.className == "<xsl:value-of select="concat($css-fbbutton,' ',$css-noprint)"/>") {
        node.removeChild(b);
      }
    }
  }
}</script></xsl:if>
<xsl:if test="$xml2rfc-ext-insert-metadata='yes' and ($is-rfc or $is-submitted-draft)"><script>
<xsl:if test="$rfcno!=''">
function getMeta(rfcno, container) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "https://www.rfc-editor.org/rfc/rfc" + rfcno + ".json", true);
  xhr.onload = function (e) {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        var data = JSON.parse(xhr.response);
        
        var cont = document.getElementById(container);
        // empty the container
        while (cont.firstChild) {
          cont.removeChild(myNode.firstChild);
        }

        var c = data.status;
        if (c) {
          var bld = newElementWithText("b", c);
          cont.appendChild(bld);
        } else {
          cont.appendChild(newElementWithText("i", "(document status unknown)"));
        }

        c = data.updated_by;
        if (c &amp;&amp; c.length > 0 &amp;&amp; c[0] !== null &amp;&amp; c[0].length > 0) {
          cont.appendChild(newElement("br"));
          cont.appendChild(newText("Updated by: "));
          appendRfcLinks(cont, c);
        }

        c = data.obsoleted_by;
        if (c &amp;&amp; c.length > 0 &amp;&amp; c[0] !== null &amp;&amp; c[0].length > 0) {
          cont.appendChild(newElement("br"));
          cont.appendChild(newText("Obsoleted by: "));
          appendRfcLinks(cont, c);
        }

        c = data.errata_url;
        if (c) {
          cont.appendChild(newElement("br"));
          var link = newElementWithText("a", "errata");
          link.setAttribute("href", c);
          var errata = newElementWithText("i", "This document has ");
          errata.appendChild(link);
          errata.appendChild(newText("."));
          cont.appendChild(errata);
        }

        cont.style.display = "block";
      } else {
        console.error(xhr.statusText);
      }
    }
  };
  xhr.onerror = function (e) {
    console.error(xhr.status + " " + xhr.statusText);
  };
  xhr.send(null);
}
function appendRfcLinks(parent, updates) {
  var template = "<xsl:call-template name="replace-substring">
  <xsl:with-param name="string" select="$xml2rfc-ext-rfc-uri"/>
  <xsl:with-param name="replace">"</xsl:with-param>
  <xsl:with-param name="by">\"</xsl:with-param>
</xsl:call-template>";
  for (var i = 0; i &lt; updates.length; i++) {
    var rfc = updates[i].trim().toLowerCase();
    if (rfc.substring(0, 3) == "rfc") {
      var no = parseInt(rfc.substring(3), 10);
      
      var link = newElement("a");
      link.setAttribute("href", template.replace("{rfc}", no));
      link.appendChild(newText(no));
      parent.appendChild(link);
    } else {
      parent.appendChild(newText(rfc));
    }
    if (i != updates.length - 1) {
      parent.appendChild(newText(", "));
    }
  }
}</xsl:if><xsl:if test="$is-submitted-draft">
function getMeta(docname, revision, container) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "https://datatracker.ietf.org/doc/" + docname + "/doc.json", true);
  xhr.onload = function (e) {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        var data = JSON.parse(xhr.response);
        
        var cont = document.getElementById(container);
        // empty the container
        while (cont.firstChild) {
          cont.removeChild(myNode.firstChild);
        }

        if (data.rev) {
          cont.style.display = "block";
          var bld = newElementWithText("b", "Internet Draft Status");
          cont.appendChild(bld);
          cont.appendChild(newElement("br"));
          if (data.rev == revision) {
            var rev = newElementWithText("i", "This is the latest submitted version.");
            cont.appendChild(rev);
          } else {
            var rev = newElementWithText("i", "This is not the current version:");
            cont.appendChild(rev);
            cont.appendChild(newElement("br"));
            var dat = "";
            if (data.time) {
              dat = ", submitted on " + data.time.substring(0,10);
            }
            rev = newElementWithText("i", "please see version " + data.rev + dat + ".");
            cont.appendChild(rev);
          }
        }
      } else {
        console.error(xhr.statusText);
      }
    }
  };
  xhr.onerror = function (e) {
    console.error(xhr.status + " " + xhr.statusText);
  };
  xhr.send(null);
}</xsl:if>

// DOM helpers
function newElement(name) {
  return document.createElement(name);
}
function newElementWithText(name, txt) {
  var e = document.createElement(name);
  e.appendChild(newText(txt));
  return e;
}
function newText(text) {
  return document.createTextNode(text);
}
</script>
</xsl:if>
<script>
function anchorRewrite() {
<xsl:text>  map = { </xsl:text>
  <xsl:for-each select="//x:anchor-alias">
    <xsl:text>"</xsl:text>
    <xsl:call-template name="replace-substring">
      <xsl:with-param name="string" select="@value"/>
      <xsl:with-param name="replace">"</xsl:with-param>
      <xsl:with-param name="by">\"</xsl:with-param>
    </xsl:call-template>
    <xsl:text>": "</xsl:text>
    <xsl:call-template name="replace-substring">
      <xsl:with-param name="string" select="ancestor::*[@anchor][1]/@anchor"/>
      <xsl:with-param name="replace">"</xsl:with-param>
      <xsl:with-param name="by">\"</xsl:with-param>
    </xsl:call-template>
    <xsl:text>"</xsl:text>
    <xsl:if test="position()!=last()">, </xsl:if>
  </xsl:for-each>
<xsl:text>};</xsl:text>
  if (window.location.hash.length >= 1) {
    var fragid = window.location.hash.substr(1);
    if (fragid) {
      if (! document.getElementById(fragid)) {
        var prefix = "<xsl:value-of select="$anchor-pref"/>";
        var mapped = map[fragid];
        if (mapped) {
          window.location.hash = mapped;
        } else if (fragid.indexOf("section-") == 0) {
          window.location.hash = prefix + "section." + fragid.substring(8);
        } else if (fragid.indexOf("appendix-") == 0) {
          window.location.hash = prefix + "section." + fragid.substring(9);
        } else if (fragid.indexOf("s-") == 0) {
          var postfix = fragid.substring(2);
          if (postfix.startsWith("abstract")) {
            window.location.hash = prefix + postfix;
          } else if (postfix.startsWith("note-")) {
            window.location.hash = prefix + "note." + postfix.substring(5);
          } else {
            window.location.hash = prefix + "section." + postfix;
          }
        } else if (fragid.indexOf("p-") == 0) {
          var r = fragid.substring(2);
          var p = r.indexOf("-");
          if (p >= 0) {
            window.location.hash = prefix + "section." + r.substring(0, p) + ".p." + r.substring(p + 1);
          }
        }
      }
    }  
  }
}
window.addEventListener('hashchange', anchorRewrite);
window.addEventListener('DOMContentLoaded', anchorRewrite);
</script><xsl:if test="$prettyprint-script!=''">
<script src="{$prettyprint-script}"/></xsl:if><xsl:if test="contains($prettyprint-script,'prettify') and (//artwork[contains(@type,'abnf')] or //sourcecode[contains(@type,'abnf')])">
<script><![CDATA[try {
PR['registerLangHandler'](
    PR['createSimpleLexer'](
        [
         // comment
         [PR['PR_COMMENT'], /^;[^\x00-\x1f]*/, null, ";"],
        ],
        [
         // string literals
         [PR['PR_STRING'], /^(\%s|\%i)?"[^"\x00-\x1f]*"/, null],
         // binary literals
         [PR['PR_LITERAL'], /^\%b[01]+((-[01]+)|(\.[01]+)*)/, null],
         // decimal literals
         [PR['PR_LITERAL'], /^\%d[0-9]+((-[0-9]+)|(\.[0-9]+)*)/, null],
         // hex literals
         [PR['PR_LITERAL'], /^(\%x[A-Za-z0-9]+((-[A-Za-z0-9]+)|(\.[A-Za-z0-9]+)*))/, null],
         // prose rule
         [PR['PR_NOCODE'], /^<[^>\x00-\x1f]*>/, null],
         // rule name
         [PR['PR_TYPE'], /^([A-Za-z][A-Za-z0-9-]*)/, null],
         [PR['PR_PUNCTUATION'], /^[=\(\)\*\/\[\]#]/, null],
        ]),
    ['ietf_abnf']);
} catch(e){}]]>
</script>
</xsl:if></xsl:template>

<!-- insert CSS style info -->

<xsl:template name="insertCss">
<style title="rfc2629.xslt">
<xsl:value-of select="$xml2rfc-ext-webfonts"/>
:root {
  --col-bg: white;
  --col-bg-error: red;
  --col-bg-highlight: yellow;
  --col-bg-highligh2: lime;
  --col-bg-light: gray;
  --col-bg-pre: lightyellow;
  --col-bg-pre1: #f8f8f8;
  --col-bg-pre2: #f0f0f0;
  --col-bg-th: #e9e9e9;
  --col-bg-tr: #f5f5f5;
  --col-fg: black;
  --col-fg-del: red;
  --col-fg-error: red;
  --col-fg-ins: green;
  --col-fg-light: gray;
  --col-fg-link: blue;
  --col-fg-title: green;
}
a {
  color: var(--col-fg-link);
  text-decoration: none;
}
a.smpl {
  color: var(--col-fg);
}
a:hover {
  text-decoration: underline;
}
a:active {
  text-decoration: underline;
}
address {
  margin-top: 1em;
  margin-left: 2em;
  font-style: normal;
}<xsl:if test="//x:blockquote|//blockquote">
blockquote {
  border-style: solid;
  border-color: var(--col-fg-light);
  border-width: 0 0 0 .25em;
  font-style: italic;
  padding-left: 0.5em;
}</xsl:if>
body {<xsl:if test="$xml2rfc-background!=''">
  background: url(<xsl:value-of select="$xml2rfc-background" />) var(--col-bg) left top;</xsl:if>
  background-color: var(--col-bg);
  color: var(--col-fg);
  font-family: <xsl:value-of select="$xml2rfc-ext-ff-body"/>;
  font-size: 16px;
  line-height: 1.5;
  margin: 10px 0px 10px 10px;
}<xsl:if test="$parsedMaxwidth!=''">
@media screen and (min-width: <xsl:value-of select="number($parsedMaxwidth + 40)"/>px) {
  body {
    margin: 10px auto;
    max-width: <xsl:value-of select="$parsedMaxwidth"/>px;
  }
}</xsl:if>
samp, span.tt, code, pre {
  font-family: <xsl:value-of select="$xml2rfc-ext-ff-pre"/>;
}<xsl:if test="//xhtml:p">
br.p {
  line-height: 150%;
}</xsl:if>
cite {
  font-style: normal;
}<xsl:if test="//x:note|//aside">
aside {
  margin-left: 2em;
}</xsl:if>
dl {
  margin-left: 2em;
}
dl > dt {
  float: left;
  margin-right: 1em;
}
dl.nohang > dt {
  float: none;
}
dl > dd {
  margin-bottom: .5em;
}
dl.compact > dd {
  margin-bottom: .0em;
}
dl > dd > dl {
  margin-top: 0.5em;
}
ul.empty {<!-- spacing between two entries in definition lists -->
  list-style-type: none;
}
<xsl:if test="//ul[@bare='true']">ul.bare {
  margin-left: -2em;
}
</xsl:if>ul.empty li {
  margin-top: .5em;
}
dl p {
  margin-left: 0em;
}
dl.<xsl:value-of select="$css-reference"/> > dt {
  font-weight: bold;
}
dl.<xsl:value-of select="$css-reference"/> > dd {
  margin-left: <xsl:choose><xsl:when test="$xml2rfc-symrefs='no'">3.5</xsl:when><xsl:otherwise>6</xsl:otherwise></xsl:choose>em;
}
h1 {
  color: var(--col-fg-title);
  font-size: 150%;
  font-weight: bold;
  text-align: center;
  margin-top: 36pt;
  margin-bottom: 0pt;
}
h2 {
  font-size: 130%;
  page-break-after: avoid;
}
h2.np {
  page-break-before: always;
}
h3 {
  font-size: 120%;
  page-break-after: avoid;
}
h4 {
  font-size: 110%;
  page-break-after: avoid;
}
h5, h6 {
  font-size: 100%;
  page-break-after: avoid;
}
h1 a, h2 a, h3 a, h4 a, h5 a, h6 a {
  color: var(--col-fg);
}
img {
  margin-left: 3em;
}
ol {
  margin-left: 2em;
}
li ol {
  margin-left: 0em;
}
ol p {
  margin-left: 0em;
}<xsl:if test="//xhtml:q">
q {
  font-style: italic;
}</xsl:if>
p {
  margin-left: 2em;
}
pre {
  font-size: 90%;
  margin-left: 3em;
  background-color: var(--col-bg-pre);
  padding: .25em;
  page-break-inside: avoid;
}<xsl:if test="//artwork[@x:is-code-component='yes']|//sourcecode[@markers='true']"><!-- support "<CODE BEGINS>" and "<CODE ENDS>" markers-->
pre.ccmarker {
  background-color: var(--col-bg);
  color: var(--col-fg-light);
}
pre.ccmarker > span {
  font-size: small;
}
pre.cct {
  margin-bottom: -1em;
}
pre.ccb {
  margin-top: -1em;
}</xsl:if>
pre.text2 {
  border-style: dotted;
  border-width: 1px;
  background-color: var(--col-bg-pre2);
}
pre.inline {
  background-color: var(--col-bg);
  padding: 0em;
  page-break-inside: auto;<xsl:if test="$prettyprint-script!=''">
  border: none !important;</xsl:if>
}
pre.text {
  border-style: dotted;
  border-width: 1px;
  background-color: var(--col-bg-pre1);
}
pre.drawing {
  border-style: solid;
  border-width: 1px;
  background-color: var(--col-bg-pre1);
  padding: 2em;
}<xsl:if test="//x:q">
q {
  font-style: italic;
}</xsl:if>
<xsl:if test="//x:sup|//sup">
sup {
  font-size: 60%;
}</xsl:if><xsl:if test="//x:sub|//sub">
sub {
  font-size: 60%;
}</xsl:if>
table {
  margin-left: 2em;
}<xsl:if test="//texttable|//table">
div.<xsl:value-of select="$css-tt"/> {
  margin-left: 2em;
} 
table.<xsl:value-of select="$css-tt"/> {
  border-collapse: collapse;
  border-color: var(--col-fg-light);
  border-spacing: 0; 
  vertical-align: top;
 }
table.<xsl:value-of select="$css-tt"/> th {
  border-color: var(--col-fg-light);
  padding: 3px;
}
table.<xsl:value-of select="$css-tt"/> td {
  border-color: var(--col-fg-light);
  padding: 3px;
}
table.all {
  border-style: solid;
  border-width: 2px;
}
table.full {
  border-style: solid;
  border-width: 2px;
}
table.<xsl:value-of select="$css-tt"/> td {
  vertical-align: top;
}
table.all td {
  border-style: solid;
  border-width: 1px;
}
table.full td {
  border-style: none solid;
  border-width: 1px;
}
table.<xsl:value-of select="$css-tt"/> th {
  vertical-align: top;
}
table.all th {
  border-style: solid;
  border-width: 1px;
}
table.full th {
  border-style: solid;
  border-width: 1px 1px 2px 1px;
}
table.<xsl:value-of select="$css-tleft"/> {
  margin-right: auto;
}
table.<xsl:value-of select="$css-tright"/> {
  margin-left: auto;
}
table.<xsl:value-of select="$css-tcenter"/> {
  margin-left: auto;
  margin-right: auto;
}
caption {
  caption-side: bottom;
  font-weight: bold;
  font-size: 80%;
  margin-top: .5em;
}
<xsl:if test="//@x:caption-side">
caption.caption-top {
  caption-side: top;
}
</xsl:if>
<xsl:if test="//table">
table.v3 tr {
    vertical-align: top;
}
table.v3 th {
  background-color: var(--col-bg-th);
  vertical-align: top;
  padding: 0.25em 0.5em;
}
table.v3 td {
  padding: 0.25em 0.5em;
}
table.v3 tr:nth-child(2n) > td {
  background-color: var(--col-bg-tr);
  vertical-align: top;
}
tr p {
  margin-left: 0em;
}
tr pre {
  margin-left: 1em;
}
tr ol {
  margin-left: 1em;
}
tr ul {
  margin-left: 1em;
}
tr dl {
  margin-left: 1em;
}
</xsl:if>
</xsl:if>
table.<xsl:value-of select="$css-header"/> {
  border-spacing: 1px;
  width: 95%;
  font-size: 90%;<xsl:if test="not(contains($styles,' header-bw '))">
  color: var(--col-bg);</xsl:if>
}
td.top {
  vertical-align: top;
}
td.topnowrap {
  vertical-align: top;
  white-space: nowrap;
}
table.<xsl:value-of select="$css-header"/> td {
  vertical-align: top;<xsl:if test="not(contains($styles,' header-bw '))">
  background-color: var(--col-bg-light);</xsl:if>
  width: 50%;
}<xsl:if test="/rfc/@obsoletes | /rfc/@updates">
table.<xsl:value-of select="$css-header"/> a {
  color: <xsl:choose><xsl:when test="not(contains($styles,' header-bw '))">var(--col-bg)</xsl:when><xsl:otherwise>var(--col-fg)</xsl:otherwise></xsl:choose>;
}</xsl:if>
ul.toc, ul.toc ul {
  list-style: none;
  margin-left: 1.5em;
  padding-left: 0em;
}
ul.toc li {
  line-height: 150%;
  font-weight: bold;
  margin-left: 0em;
}
ul.toc li li {
  line-height: normal;
  font-weight: normal;
  font-size: 90%;
  margin-left: 0em;
}
li.excluded {
  font-size: 0%;
}
ul {
  margin-left: 2em;
}
li ul {
  margin-left: 0em;
}
ul p {
  margin-left: 0em;
}
.filename, h1, h2, h3, h4 {
  font-family: <xsl:value-of select="$xml2rfc-ext-ff-title"/>;
}
<xsl:if test="$has-index">ul.ind, ul.ind ul {
  list-style: none;
  margin-left: 1.5em;
  padding-left: 0em;
  page-break-before: avoid;
}
ul.ind li {
  font-weight: bold;
  line-height: 200%;
  margin-left: 0em;
}
ul.ind li li {
  font-weight: normal;
  line-height: 150%;
  margin-left: 0em;
}</xsl:if><xsl:if test="//svg:svg">
@namespace svg url(http://www.w3.org/2000/svg);
svg|svg {
  margin-left: 3em;
}
svg {
  margin-left: 3em;
}</xsl:if>
.avoidbreakinside {
  page-break-inside: avoid;
}
.avoidbreakafter {
  page-break-after: avoid;
}
<xsl:if test="//t/@keepWithPrevious">.avoidbreakbefore {
  page-break-before: avoid;
}
</xsl:if><xsl:if test="//*[@removeInRFC='true']">section.rfcEditorRemove > div:first-of-type {
  font-style: italic;
}</xsl:if><xsl:if test="//x:bcp14|//bcp14">.bcp14 {
  font-style: normal;
  text-transform: lowercase;
  font-variant: small-caps;
}</xsl:if><xsl:if test="//x:blockquote|//blockquote">
blockquote > * .bcp14 {
  font-style: italic;
}</xsl:if>
.comment {
  background-color: var(--col-bg-highlight);
}<xsl:if test="$xml2rfc-editing='yes'">
.editingmark {
  background-color: var(--col-bg-highlight);
}</xsl:if>
.<xsl:value-of select="$css-center"/> {
  text-align: center;
}
.<xsl:value-of select="$css-error"/> {
  color: var(--col-fg-error);
  font-style: italic;
  font-weight: bold;
}
.figure {
  font-weight: bold;
  text-align: center;
  font-size: 80%;
}
.filename {
  font-size: 112%;
  font-weight: bold;
  line-height: 21pt;
  text-align: center;
  margin-top: 0pt;
}
.fn {
  font-weight: bold;
}
.<xsl:value-of select="$css-left"/> {
  text-align: left;
}
.<xsl:value-of select="$css-right"/> {
  text-align: right;
}
.warning {
  font-size: 130%;
  background-color: var(--col-bg-highlight);
}<xsl:if test="$xml2rfc-ext-paragraph-links='yes'">
.self {
    color: var(--col-fg-light);
    margin-left: .3em;
    text-decoration: none;
    visibility: hidden;
    -webkit-user-select: none;<!-- not std CSS yet--> 
    -moz-user-select: none;
    -ms-user-select: none;
}
.self:hover {
    text-decoration: none;
}
h1:hover > a.self, h2:hover > a.self, h3:hover > a.self, li:hover > a.self, p:hover > a.self {
    visibility: visible;
}</xsl:if><xsl:if test="$has-edits">del {
  color: var(--col-fg-del);
  text-decoration: line-through;
}
.del {
  color: var(--col-fg-del);
  text-decoration: line-through;
}
ins {
  color: var(--col-fg-ins);
  text-decoration: underline;
}
.ins {
  color: var(--col-fg-ins);
  text-decoration: underline;
}
div.issuepointer {
  float: left;
}</xsl:if><xsl:if test="//ed:issue">
table.openissue {
  background-color: var(--col-bg-highlight);
  border-width: thin;
  border-style: solid;
  border-color: var(--col-fg);
}
table.closedissue {
  background-color: var(--col-bg);
  border-width: thin;
  border-style: solid;
  border-color: var(--col-fg-light);
  color: var(--col-fg-light);
}
thead th {
  text-align: left;
}
.bg-issue {
  border: solid;
  border-width: 1px;
  font-size: 66%;
}
.closed-issue {
  border: solid;
  border-width: thin;
  background-color: var(--col-bg-highlight2);
  font-size: smaller;
  font-weight: bold;
}
.open-issue {
  border: solid;
  border-width: thin;
  background-color: var(--col-bg-error);
  font-size: smaller;
  font-weight: bold;
}
.editor-issue {
  border: solid;
  border-width: thin;
  background-color: var(--col-bg-highlight);
  font-size: smaller;
  font-weight: bold;
}</xsl:if><xsl:if test="$xml2rfc-ext-refresh-from!=''">.refreshxmlerror {
  position: fixed;
  top: 1%;
  right: 1%;
  padding: 5px 5px;
  color: var(--col-bg-highlight);
  background: var(--col-fg);
}
.refreshbrowsererror {
  position: fixed;
  top: 1%;
  left: 1%;
  padding: 5px 5px;
  color: var(--col-bg-error);
  background: var(--col-fg);
}</xsl:if><xsl:if test="/rfc/x:feedback">.<xsl:value-of select="$css-feedback"/> {
  position: fixed;
  bottom: 1%;
  right: 1%;
  padding: 3px 5px;
  color: var(--col-bg);
  border-radius: 5px;
  background: #006400;
  border: 1px solid silver;
  -webkit-user-select: none;<!-- not std CSS yet--> 
  -moz-user-select: none;
  -ms-user-select: none;
}
.<xsl:value-of select="$css-fbbutton"/> {
  margin-left: 1em;
  color: #303030;
  font-size: small;
  font-weight: normal;
  background: #d0d000;
  padding: 1px 4px;
  border: 1px solid silver;
  border-radius: 5px;
  -webkit-user-select: none;<!-- not std CSS yet--> 
  -moz-user-select: none;
  -ms-user-select: none;
}</xsl:if><xsl:if test="$xml2rfc-ext-justification='always'">
dd, li, p {
  text-align: justify;
}</xsl:if><xsl:if test="$xml2rfc-ext-insert-metadata='yes' and ($is-rfc or $is-submitted-draft)">
.<xsl:value-of select="$css-docstatus"/> {
  border: 1px solid var(--col-fg);
  display: none;
  float: right;
  margin: 2em;
  padding: 1em;
  -webkit-user-select: none;<!-- not std CSS yet--> 
  -moz-user-select: none;
  -ms-user-select: none;
}</xsl:if><xsl:if test="$errata-parsed">
.<xsl:value-of select="$css-erratum"/> {
  border: 1px solid orangered;
  border-left: 0.75em solid orangered;
  float: right;
  padding: 0.5em;
  -webkit-user-select: none;<!-- not std CSS yet--> 
  -moz-user-select: none;
  -ms-user-select: none;
}<xsl:if test="$parsedMaxwidth!=''">
@media screen and (min-width: <xsl:value-of select="number($parsedMaxwidth + 350)"/>px) {
  .<xsl:value-of select="$css-erratum"/> {
    margin-right: -150px;
  }
}</xsl:if></xsl:if><xsl:if test="$published-as-rfc">
.<xsl:value-of select="$css-publishedasrfc"/> {
  background-color: var(--col-bg-highlight);
  color: var(--col-fg);
  font-size: 115%;
  text-align: center;
}</xsl:if><xsl:if test="$prettyprint-class='prettyprint' and contains($prettyprint-script,'prettify') and not(contains($prettyprint-script,'skin='))">
  pre.prettyprint .pln { color: #000; }
  pre.prettyprint .str, pre.prettyprint .atv { color: #080; }
  pre.prettyprint .kwd, pre.prettyprint .tag { color: #008; }
  pre.prettyprint .com { color: #800; }
  pre.prettyprint .typ, pre.prettyprint .atn, pre.prettyprint .dec, pre.prettyprint .var { color: #606; }
  pre.prettyprint .lit { color: #066; }
  pre.prettyprint .pun, pre.prettyprint .opn, pre.prettyprint .clo { color: #660; }
</xsl:if>

@media screen {
  pre.text, pre.text2, pre.drawing {
    width: 69ch;
  }
}

@media print {
  .<xsl:value-of select="$css-noprint"/> {
    display: none;
  }

  a {
    color: black;
    text-decoration: none;
  }

  table.<xsl:value-of select="$css-header"/> {
    width: 90%;
  }

  td.<xsl:value-of select="$css-header"/> {
    width: 50%;
    color: black;
    background-color: white;
    vertical-align: top;
    font-size: 110%;
  }

  ul.toc a:last-child::after {
    content: leader('.') target-counter(attr(href), page);
  }

  ul.ind li li a {<!-- links in the leaf nodes of the index should go to page numbers -->
    content: target-counter(attr(href), page);
  }

  .print2col {
    column-count: 2;
    -moz-column-count: 2;<!-- for Firefox -->
    column-fill: auto;<!-- for PrinceXML -->
  }
<xsl:if test="$xml2rfc-ext-justification='print'">
  dd, li, p {
    text-align: justify;
  }
</xsl:if>}
@page<xsl:if test="$xml2rfc-ext-duplex='yes'">:right</xsl:if> {
  font-family: <xsl:value-of select="$xml2rfc-ext-ff-body"/>;
  @top-left {
       content: "<xsl:call-template name="get-header-left"/>";
  }
  @top-right {
       content: "<xsl:call-template name="get-header-right"/>";
  }
  @top-center {
       content: "<xsl:call-template name="get-header-center"/>";
  }
  @bottom-left {
       content: "<xsl:call-template name="get-author-summary"/>";
  }
  @bottom-center {
       content: "<xsl:call-template name="get-bottom-center"/>";
  }
  @bottom-right {
       content: "[Page " counter(page) "]";
  }
}<xsl:if test="$xml2rfc-ext-duplex='yes'">
@page:left {
  font-family: <xsl:value-of select="$xml2rfc-ext-ff-body"/>;
  @top-left {
       content: "<xsl:call-template name="get-header-right"/>";
  }
  @top-right {
       content: "<xsl:call-template name="get-header-left"/>";
  }
  @top-center {
       content: "<xsl:call-template name="get-header-center"/>";
  }
  @bottom-left {
       content: "[Page " counter(page) "]";
  }
  @bottom-center {
       content: "<xsl:call-template name="get-bottom-center"/>";
  }
  @bottom-right {
       content: "<xsl:call-template name="get-author-summary"/>";
  }
}
</xsl:if>
@page:first {
    @top-left {
      content: normal;
    }
    @top-right {
      content: normal;
    }
    @top-center {
      content: normal;
    }
}
<xsl:if test="$xml2rfc-ext-dark-mode!='no'">
@media (prefers-color-scheme: dark) {
  :root {
    --col-bg: black;
    --col-bg-error: red;
    --col-bg-highlight: #9e9e20;
    --col-bg-highligh2: lime;
    --col-bg-light: gray;
    --col-bg-pre: #202000;
    --col-bg-pre1: #080808;
    --col-bg-pre2: #101010;
    --col-bg-th: #303030;
    --col-bg-tr: #202020;
    --col-fg: white;
    --col-fg-del: red;
    --col-fg-error: red;
    --col-fg-ins: green;
    --col-fg-light: gray;
    --col-fg-link: lightblue;
    --col-fg-title: green;
  }
  
  pre.prettyprint .pln { color: #fff; }
  pre.prettyprint .str, pre.prettyprint .atv { color: #8f8; }
  pre.prettyprint .kwd, pre.prettyprint .tag { color: #88f; }
  pre.prettyprint .com { color: #f88; }
  pre.prettyprint .typ, pre.prettyprint .atn, pre.prettyprint .dec, pre.prettyprint .var { color: #f8f; }
  pre.prettyprint .lit { color: #8ff; }
  pre.prettyprint .pun, pre.prettyprint .opn, pre.prettyprint .clo { color: #ff8; }
}
</xsl:if>
</style>
</xsl:template>


<!-- generate the index section -->

<xsl:template name="insertSingleIref">
  <xsl:choose>
    <xsl:when test="@ed:xref">
      <!-- special index generator mode -->
      <xsl:text>[</xsl:text>
      <a href="#{@ed:xref}"><xsl:value-of select="@ed:xref"/></a>
      <xsl:text>, </xsl:text>
      <a>
        <xsl:variable name="htmluri" select="//reference[@anchor=current()/@ed:xref]/format[@type='HTML']/@target"/>
        <xsl:if test="$htmluri">
          <xsl:attribute name="href"><xsl:value-of select="concat($htmluri,'#',@ed:frag)"/></xsl:attribute>
        </xsl:if>
        <xsl:choose>
          <xsl:when test="@primary='true'"><b><xsl:value-of select="@ed:label" /></b></xsl:when>
          <xsl:otherwise><xsl:value-of select="@ed:label" /></xsl:otherwise>
        </xsl:choose>
      </a>
      <xsl:text>]</xsl:text>
      <xsl:if test="position()!=last()">, </xsl:if>
    </xsl:when>
    <xsl:otherwise>
      <xsl:variable name="_n">
        <xsl:call-template name="get-section-number" />
      </xsl:variable>
      <xsl:variable name="n">
        <xsl:choose>
          <xsl:when test="$_n!=''">
            <xsl:value-of select="$_n"/>
          </xsl:when>
          <xsl:otherwise>&#167;</xsl:otherwise>
        </xsl:choose>
      </xsl:variable>
      <xsl:variable name="backlink">
        <xsl:choose>
          <xsl:when test="self::xref">
            <xsl:variable name="target" select="@target"/>
            <xsl:comment>workaround for Saxon 9.1 bug; force evaluation of: <xsl:value-of select="$target"/></xsl:comment>
            <xsl:variable name="no"><xsl:number level="any" count="xref[@target=$target]"/></xsl:variable>
            <xsl:text>#</xsl:text>
            <xsl:value-of select="$anchor-pref"/>
            <xsl:text>xref.</xsl:text>
            <xsl:value-of select="@target"/>
            <xsl:text>.</xsl:text>
            <xsl:value-of select="$no"/>
          </xsl:when>
          <xsl:when test="self::iref">
            <xsl:text>#</xsl:text>
            <xsl:call-template name="compute-iref-anchor"/>
          </xsl:when>
          <xsl:when test="self::x:ref">
            <xsl:text>#</xsl:text>
            <xsl:call-template name="compute-extref-anchor"/>
          </xsl:when>
          <xsl:otherwise>
            <xsl:message>Unsupported element type for insertSingleIref</xsl:message>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:variable>
      <a href="{$backlink}">
        <xsl:call-template name="insertInsDelClass"/>
        <xsl:choose>
          <xsl:when test="@primary='true'"><b><xsl:value-of select="$n"/></b></xsl:when>
          <xsl:otherwise><xsl:value-of select="$n"/></xsl:otherwise>
        </xsl:choose>
      </a>
      <xsl:if test="position()!=last()">, </xsl:if>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="insertSingleXref">
  <xsl:variable name="_n">
    <xsl:call-template name="get-section-number" />
  </xsl:variable>
  <xsl:variable name="n">
    <xsl:choose>
      <xsl:when test="$_n!=''">
        <xsl:value-of select="$_n"/>
      </xsl:when>
      <xsl:otherwise>&#167;</xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <xsl:choose>
    <xsl:when test="self::reference">
      <a href="#{@anchor}">
        <xsl:call-template name="insertInsDelClass"/>
        <b><xsl:value-of select="$n"/></b>
      </a>
    </xsl:when>
    <xsl:otherwise>
      <xsl:variable name="target" select="@target"/>
      <xsl:variable name="backlink">#<xsl:value-of select="$anchor-pref"/>xref.<xsl:value-of select="$target"/>.<xsl:number level="any" count="xref[@target=$target]|relref[@target=$target]"/></xsl:variable>
      <a href="{$backlink}">
        <xsl:call-template name="insertInsDelClass"/>
        <xsl:value-of select="$n"/>
      </a>
    </xsl:otherwise>
  </xsl:choose>
  <xsl:if test="position()!=last()">, </xsl:if>
</xsl:template>

<!-- generate navigation links to index subsections -->
<xsl:template name="insert-index-navigation">
  <p class="{$css-noprint}">

    <xsl:for-each select="//iref | //reference[not(starts-with(@anchor,'deleted-'))]">
    
      <xsl:sort select="translate(concat(@item,/rfc/back/displayreference[@target=current()/@anchor]/@to,@anchor),$lcase,$ucase)" />

      <xsl:variable name="letter" select="translate(substring(concat(@item,/rfc/back/displayreference[@target=current()/@anchor]/@to,@anchor),1,1),$lcase,$ucase)"/>
      
      <!-- first of character and character? -->
      <xsl:if test="generate-id(.) = generate-id(key('index-first-letter',$letter)[1]) and translate($letter,$alnum,'')=''">
        <xsl:variable name="showit" select="$xml2rfc-ext-include-references-in-index='yes' or self::iref"/>

        <xsl:if test="$showit">
          <a href="#{$anchor-pref}index.{$letter}">
            <xsl:value-of select="$letter" />
          </a>
          <xsl:text> </xsl:text>
        </xsl:if>
      </xsl:if>
    </xsl:for-each>
  </p>
</xsl:template>

<xsl:template name="format-section-ref">
  <xsl:param name="number"/>
  <xsl:choose>
    <xsl:when test="translate(substring($number,1,1),$ucase,'')=''">
      <xsl:text>Appendix </xsl:text>
    </xsl:when>
    <xsl:otherwise>
      <xsl:text>Section </xsl:text>
    </xsl:otherwise>
  </xsl:choose>
  <xsl:value-of select="$number"/>
</xsl:template>

<xsl:template name="insert-index-item">
  <xsl:param name="in-artwork"/>
  <xsl:param name="irefs"/>
  <xsl:param name="xrefs"/>
  <xsl:param name="extrefs"/>

  <xsl:choose>
    <xsl:when test="$in-artwork">
      <span class="tt"><xsl:value-of select="@item" /></span>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="@item" />
    </xsl:otherwise>
  </xsl:choose>
  <xsl:text>&#160;&#160;</xsl:text>

  <xsl:for-each select="$irefs|$xrefs|$extrefs">
    <xsl:call-template name="insertSingleIref" />
  </xsl:for-each>
</xsl:template>

<xsl:template name="insert-index-subitem">
  <xsl:param name="in-artwork"/>
  <xsl:param name="irefs"/>
  <xsl:param name="xrefs"/>
  <xsl:param name="extrefs"/>

  <li>
    <xsl:choose>
      <xsl:when test="$in-artwork">
        <span class="tt"><xsl:value-of select="@subitem" /></span>
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="@subitem" />
      </xsl:otherwise>
    </xsl:choose>
    <xsl:text>&#160;&#160;</xsl:text>

    <xsl:for-each select="$irefs|$xrefs|$extrefs">
      <xsl:call-template name="insertSingleIref" />
    </xsl:for-each>
  </li>
</xsl:template>


<xsl:variable name="item-wrapper-element">li</xsl:variable>
<xsl:attribute-set name="item-wrapper-element"/>
<xsl:variable name="subitems-wrapper-element">ul</xsl:variable>

<xsl:template name="insert-index-regular-iref">

  <xsl:if test="generate-id(.) = generate-id(key('index-item',concat(@item,@anchor))[1])">
    <xsl:variable name="item" select="@item"/>
    <xsl:variable name="in-artwork" select="key('index-item',$item)[@primary='true' and ancestor::artwork]"/>

    <xsl:element name="{$item-wrapper-element}" use-attribute-sets="item-wrapper-element">
      <xsl:variable name="irefs3" select="key('index-item',@item)[not(@subitem) or @subitem='']"/>
      <xsl:variable name="xrefs3" select="key('xref-item',$irefs3[@x:for-anchor='']/../@anchor) | key('xref-item',$irefs3/@x:for-anchor)"/>
      <xsl:variable name="extrefs3" select="key('extref-item',$irefs3[@x:for-anchor='']/../@anchor) | key('extref-item',$irefs3/@x:for-anchor)"/>

      <xsl:call-template name="insert-index-item">
        <xsl:with-param name="in-artwork" select="key('index-item',@item)[@primary='true' and (ancestor::artwork or ancestor::sourcecode)]"/>
        <xsl:with-param name="irefs" select="$irefs3"/>
        <xsl:with-param name="xrefs" select="$xrefs3"/>
        <xsl:with-param name="extrefs" select="$extrefs3"/>
      </xsl:call-template>

      <xsl:variable name="s2" select="key('index-item',@item)[@subitem!='']"/>
      <xsl:if test="$s2">
        <xsl:element name="{$subitems-wrapper-element}">
          <xsl:for-each select="$s2">
            <xsl:sort select="translate(@subitem,$lcase,$ucase)" />

            <xsl:if test="generate-id(.) = generate-id(key('index-item-subitem',concat(@item,'..',@subitem))[1])">

                <xsl:variable name="irefs4" select="key('index-item-subitem',concat(@item,'..',@subitem))"/>
                <xsl:variable name="xrefs4" select="key('xref-item',$irefs4[@x:for-anchor='']/../@anchor) | key('xref-item',$irefs4/@x:for-anchor)"/>
                <xsl:variable name="extrefs4" select="key('extref-item',$irefs4[@x:for-anchor='']/../@anchor) | key('extref-item',$irefs4/@x:for-anchor)"/>

              <xsl:call-template name="insert-index-subitem">
                <xsl:with-param name="in-artwork" select="key('index-item-subitem',concat(@item,'..',@subitem))[@primary='true' and (ancestor::artwork or ancestor::sourcecode)]"/>
                <xsl:with-param name="irefs" select="$irefs4"/>
                <xsl:with-param name="xrefs" select="$xrefs4"/>
                <xsl:with-param name="extrefs" select="$extrefs4"/>
              </xsl:call-template>
            </xsl:if>
          </xsl:for-each>
        </xsl:element>
      </xsl:if>
    </xsl:element>
  </xsl:if>
</xsl:template>

<!-- generate the index section -->

<xsl:template name="insertIndex">

  <xsl:call-template name="insert-conditional-hrule"/>

  <section id="{$anchor-pref}index">
    <xsl:call-template name="insert-conditional-pagebreak"/>
    <h2>
      <a href="#{$anchor-pref}index">Index</a>
    </h2>

    <xsl:call-template name="insert-index-navigation"/>
    
    <!-- for each index subsection -->
    <div class="print2col">
      <ul class="ind">
        <xsl:for-each select="//iref | //reference[not(starts-with(@anchor,'deleted-'))]">
          <xsl:sort select="translate(concat(@item,/rfc/back/displayreference[@target=current()/@anchor]/@to,@anchor),$lcase,$ucase)" />
          <xsl:variable name="letter" select="translate(substring(concat(@item,/rfc/back/displayreference[@target=current()/@anchor]/@to,@anchor),1,1),$lcase,$ucase)"/>
    
          <xsl:variable name="showit" select="$xml2rfc-ext-include-references-in-index='yes' or self::iref"/>
          <xsl:if test="$showit and generate-id(.) = generate-id(key('index-first-letter',$letter)[1])">
            <li>
    
              <!-- make letters and digits stand out -->
              <xsl:choose>
                <xsl:when test="translate($letter,concat($lcase,$ucase,'0123456789'),'')=''">
                  <a id="{$anchor-pref}index.{$letter}" href="#{$anchor-pref}index.{$letter}">
                    <b><xsl:value-of select="$letter" /></b>
                  </a>
                </xsl:when>
                <xsl:otherwise>
                  <b><xsl:value-of select="$letter" /></b>
                </xsl:otherwise>
              </xsl:choose>
    
              <ul>
                <xsl:for-each select="key('index-first-letter',$letter)">
    
                  <xsl:sort select="translate(concat(@item,@anchor),$lcase,$ucase)" />
    
                  <xsl:choose>
                    <xsl:when test="self::reference">
                      <xsl:if test="$xml2rfc-ext-include-references-in-index='yes' and not(starts-with(@anchor,'deleted-'))">
                        <li>
                          <xsl:variable name="val">
                            <xsl:call-template name="reference-name"/>
                          </xsl:variable>
                          <em>
                            <xsl:value-of select="substring($val,2,string-length($val)-2)"/>
                          </em>
                          <xsl:text>&#160;&#160;</xsl:text>
    
                          <xsl:variable name="rs" select="key('xref-item',current()/@anchor) | . | key('anchor-item',concat('deleted-',current()/@anchor))"/>
    
                          <xsl:for-each select="$rs">
                            <xsl:call-template name="insertSingleXref" />
                          </xsl:for-each>
    
                          <xsl:variable name="rs2" select="$rs[@x:sec|@section]"/>
    
                          <xsl:if test="$rs2">
                            <ul>
                              <xsl:for-each select="$rs2">
                                <xsl:sort select="substring-before(concat(@x:sec,@section,'.'),'.')" data-type="number"/>
                                <xsl:sort select="substring(concat(@x:sec,@section),2+string-length(substring-before(concat(@x:sec,@section),'.')))" data-type="number"/>
    
                                <xsl:if test="generate-id(.) = generate-id(key('index-xref-by-sec',concat(@target,'..',@x:sec,@section))[1])">
                                  <li>
                                    <em>
                                      <xsl:call-template name="format-section-ref">
                                        <xsl:with-param name="number" select="concat(@x:sec,@section)"/>
                                      </xsl:call-template>
                                    </em>
                                    <xsl:text>&#160;&#160;</xsl:text>
                                    <xsl:for-each select="key('index-xref-by-sec',concat(@target,'..',@x:sec,@section))">
                                      <xsl:call-template name="insertSingleXref" />
                                    </xsl:for-each>
                                  </li>
                                </xsl:if>
                              </xsl:for-each>
                            </ul>
                          </xsl:if>
    
                          <xsl:if test="current()/x:source/@href">
                            <xsl:variable name="rs3" select="$rs[not(@x:sec) and @x:rel]"/>
                            <xsl:variable name="doc" select="document(current()/x:source/@href)"/>
                            <xsl:if test="$rs3">
                              <ul>
                                <xsl:for-each select="$rs3">
                                  <xsl:sort select="count($doc//*[@anchor and following::*/@anchor=substring-after(current()/@x:rel,'#')])" order="ascending" data-type="number"/>
                                  <xsl:if test="generate-id(.) = generate-id(key('index-xref-by-anchor',concat(@target,'..',@x:rel))[1])">
                                    <xsl:variable name="sec">
                                      <xsl:for-each select="$doc//*[@anchor=substring-after(current()/@x:rel,'#')]">
                                        <xsl:call-template name="get-section-number"/>
                                      </xsl:for-each>
                                    </xsl:variable>
                                    <xsl:if test="$sec!=''">
                                      <li>
                                        <em>
                                          <xsl:choose>
                                            <xsl:when test="starts-with($sec,$unnumbered)">
                                              <xsl:for-each select="$doc//*[@anchor=substring-after(current()/@x:rel,'#')]">
                                                <xsl:call-template name="get-title-as-string"/>
                                              </xsl:for-each>
                                            </xsl:when>
                                            <xsl:otherwise>
                                              <xsl:call-template name="format-section-ref">
                                                <xsl:with-param name="number" select="$sec"/>
                                              </xsl:call-template>
                                            </xsl:otherwise>
                                          </xsl:choose>
                                        </em>
                                        <xsl:text>&#160;&#160;</xsl:text>
                                        <xsl:for-each select="key('index-xref-by-anchor',concat(@target,'..',@x:rel))">
                                          <xsl:call-template name="insertSingleXref" />
                                        </xsl:for-each>
                                      </li>
                                    </xsl:if>
                                  </xsl:if>
                                </xsl:for-each>
                              </ul>
                            </xsl:if>
                          </xsl:if>
                        </li>
                      </xsl:if>
                    </xsl:when>
                    <xsl:otherwise>
                      <xsl:call-template name="insert-index-regular-iref"/>
                    </xsl:otherwise>
                  </xsl:choose>
                </xsl:for-each>
              </ul>
            </li>
          </xsl:if>
    
        </xsl:for-each>
      </ul>
    </div>
  </section>
</xsl:template>

<xsl:template name="insertPreamble" myns:namespaceless-elements="xml2rfc">

  <xsl:param name="notes"/>

<boilerplate>
  <!-- TLP4, Section 6.c.iii -->
  <xsl:variable name="pre5378EscapeClause">
    This document may contain material from IETF Documents or IETF Contributions published or
    made publicly available before November 10, 2008. The person(s) controlling the copyright in
    some of this material may not have granted the IETF Trust the right to allow modifications of such
    material outside the IETF Standards Process. Without obtaining an adequate license from the
    person(s) controlling the copyright in such materials, this document may not be modified outside
    the IETF Standards Process, and derivative works of it may not be created outside the IETF
    Standards Process, except to format it for publication as an RFC or to translate it into languages
    other than English.
  </xsl:variable>

  <!-- TLP1, Section 6.c.i -->
  <xsl:variable name="noModificationTrust200811Clause">
    This document may not be modified, and derivative works of it may not be
    created, except to format it for publication as an RFC and to translate it
    into languages other than English.
  </xsl:variable>

  <!-- TLP2..4, Section 6.c.i -->
  <xsl:variable name="noModificationTrust200902Clause">
    This document may not be modified, and derivative works of it may not be
    created, except to format it for publication as an RFC or to translate it
    into languages other than English.<!-- "and" changes to "or" -->
  </xsl:variable>

  <!-- TLP1..4, Section 6.c.ii -->
  <xsl:variable name="noDerivativesTrust200___Clause">
    This document may not be modified, and derivative works of it may not be
    created, and it may not be published except as an Internet-Draft.
  </xsl:variable>

  <section anchor="{$anchor-pref}status">
  <name>
    <xsl:choose>
      <xsl:when test="$xml2rfc-rfcedstyle='yes' or $src/rfc/@version >= 3">Status of This Memo</xsl:when>
      <xsl:otherwise>Status of this Memo</xsl:otherwise>
    </xsl:choose>
  </name>

  <xsl:choose>
    <xsl:when test="@ipr and not($is-rfc)">
      <t>
        <xsl:choose>

          <!-- RFC2026 -->
          <xsl:when test="@ipr = 'full2026'">
            This document is an Internet-Draft and is
            in full conformance with all provisions of Section 10 of RFC2026.
          </xsl:when>
          <xsl:when test="@ipr = 'noDerivativeWorks2026'">
            This document is an Internet-Draft and is
            in full conformance with all provisions of Section 10 of RFC2026
            except that the right to produce derivative works is not granted.
          </xsl:when>
          <xsl:when test="@ipr = 'noDerivativeWorksNow'">
            This document is an Internet-Draft and is
            in full conformance with all provisions of Section 10 of RFC2026
            except that the right to produce derivative works is not granted.
            (If this document becomes part of an IETF working group activity,
            then it will be brought into full compliance with Section 10 of RFC2026.)
          </xsl:when>
          <xsl:when test="@ipr = 'none'">
            This document is an Internet-Draft and is
            NOT offered in accordance with Section 10 of RFC2026,
            and the author does not provide the IETF with any rights other
            than to publish as an Internet-Draft.
          </xsl:when>

          <!-- RFC3667 -->
          <xsl:when test="@ipr = 'full3667'">
            This document is an Internet-Draft and is subject to all provisions
            of section 3 of RFC 3667.  By submitting this Internet-Draft, each
            author represents that any applicable patent or other IPR claims of
            which he or she is aware have been or will be disclosed, and any of
            which he or she become aware will be disclosed, in accordance with
            RFC 3668.
          </xsl:when>
          <xsl:when test="@ipr = 'noModification3667'">
            This document is an Internet-Draft and is subject to all provisions
            of section 3 of RFC 3667.  By submitting this Internet-Draft, each
            author represents that any applicable patent or other IPR claims of
            which he or she is aware have been or will be disclosed, and any of
            which he or she become aware will be disclosed, in accordance with
            RFC 3668.  This document may not be modified, and derivative works of
            it may not be created, except to publish it as an RFC and to
            translate it into languages other than English<xsl:if test="@iprExtract">,
            other than to extract <xref target="{@iprExtract}"/> as-is
            for separate use</xsl:if>.
          </xsl:when>
          <xsl:when test="@ipr = 'noDerivatives3667'">
            This document is an Internet-Draft and is subject to all provisions
            of section 3 of RFC 3667 except for the right to produce derivative
            works.  By submitting this Internet-Draft, each author represents
            that any applicable patent or other IPR claims of which he or she
            is aware have been or will be disclosed, and any of which he or she
            become aware will be disclosed, in accordance with RFC 3668.  This
            document may not be modified, and derivative works of it may
            not be created<xsl:if test="@iprExtract">, other than to extract
            <xref target="{@iprExtract}"/> as-is for separate use</xsl:if>.
          </xsl:when>

          <!-- RFC3978 -->
          <xsl:when test="@ipr = 'full3978'">
            By submitting this Internet-Draft, each
            author represents that any applicable patent or other IPR claims of
            which he or she is aware have been or will be disclosed, and any of
            which he or she becomes aware will be disclosed, in accordance with
            Section 6 of BCP 79.
          </xsl:when>
          <xsl:when test="@ipr = 'noModification3978'">
            By submitting this Internet-Draft, each
            author represents that any applicable patent or other IPR claims of
            which he or she is aware have been or will be disclosed, and any of
            which he or she becomes aware will be disclosed, in accordance with
            Section 6 of BCP 79.  This document may not be modified, and derivative works of
            it may not be created, except to publish it as an RFC and to
            translate it into languages other than English<xsl:if test="@iprExtract">,
            other than to extract <xref target="{@iprExtract}"/> as-is
            for separate use</xsl:if>.
          </xsl:when>
          <xsl:when test="@ipr = 'noDerivatives3978'">
            By submitting this Internet-Draft, each author represents
            that any applicable patent or other IPR claims of which he or she
            is aware have been or will be disclosed, and any of which he or she
            becomes aware will be disclosed, in accordance with Section 6 of BCP 79.  This
            document may not be modified, and derivative works of it may
            not be created<xsl:if test="@iprExtract">, other than to extract
            <xref target="{@iprExtract}"/> as-is for separate use</xsl:if>.
          </xsl:when>

          <!-- as of Jan 2010, TLP 4.0 -->
          <xsl:when test="$ipr-2010-01 and (@ipr = 'trust200902'
                          or @ipr = 'noModificationTrust200902'
                          or @ipr = 'noDerivativesTrust200902'
                          or @ipr = 'pre5378Trust200902')">
            This Internet-Draft is submitted in full conformance with
            the provisions of BCP 78 and BCP 79.
          </xsl:when>

          <!-- as of Nov 2008, Feb 2009 and Sep 2009 -->
          <xsl:when test="@ipr = 'trust200811'
                          or @ipr = 'noModificationTrust200811'
                          or @ipr = 'noDerivativesTrust200811'
                          or @ipr = 'trust200902'
                          or @ipr = 'noModificationTrust200902'
                          or @ipr = 'noDerivativesTrust200902'
                          or @ipr = 'pre5378Trust200902'">
            This Internet-Draft is submitted to IETF in full conformance with
            the provisions of BCP 78 and BCP 79.
          </xsl:when>
          <xsl:otherwise>
            CONFORMANCE UNDEFINED.
          </xsl:otherwise>
        </xsl:choose>

        <!-- warn about iprExtract without effect -->
        <xsl:if test="@iprExtract and (@ipr != 'noModification3667' and @ipr != 'noDerivatives3667' and @ipr != 'noModification3978' and @ipr != 'noDerivatives3978')">
          <xsl:call-template name="warning">
            <xsl:with-param name="msg" select="concat('/rfc/@iprExtract does not have any effect for /rfc/@ipr=',@ipr)"/>
          </xsl:call-template>
        </xsl:if>

        <!-- restrictions -->
        <xsl:choose>
          <xsl:when test="@ipr = 'noModificationTrust200811'">
            <xsl:value-of select="$noModificationTrust200811Clause"/>
          </xsl:when>
          <xsl:when test="@ipr = 'noDerivativesTrust200811'">
            <xsl:value-of select="$noDerivativesTrust200___Clause"/>
          </xsl:when>
          <xsl:when test="@ipr = 'noModificationTrust200902'">
            <xsl:value-of select="$noModificationTrust200902Clause"/>
          </xsl:when>
          <xsl:when test="@ipr = 'noDerivativesTrust200902'">
            <xsl:value-of select="$noDerivativesTrust200___Clause"/>
          </xsl:when>
          <!-- escape clause moved to Copyright Notice as of 2009-11 -->
          <xsl:when test="@ipr = 'pre5378Trust200902' and $pub-yearmonth &lt; 200911">
            <xsl:value-of select="$pre5378EscapeClause"/>
          </xsl:when>

          <xsl:otherwise />
        </xsl:choose>
      </t>
      <xsl:choose>
        <xsl:when test="$id-boilerplate='2010'">
          <xsl:variable name="current-uri">http<xsl:if test="$rfc-boilerplate-use-https">s</xsl:if>://datatracker.ietf.org/drafts/current/</xsl:variable>
          <t>
            Internet-Drafts are working documents of the Internet Engineering
            Task Force (IETF). Note that other groups may also distribute
            working documents as Internet-Drafts. The list of current
            Internet-Drafts is at <eref target="{$current-uri}"><xsl:value-of select="$current-uri"/></eref>.
          </t>
        </xsl:when>
        <xsl:otherwise>
          <t>
            Internet-Drafts are working documents of the Internet Engineering
            Task Force (IETF), its areas, and its working groups.
            Note that other groups may also distribute working documents as
            Internet-Drafts.
          </t>
        </xsl:otherwise>
      </xsl:choose>
      <t>
        Internet-Drafts are draft documents valid for a maximum of six months
        and may be updated, replaced, or obsoleted by other documents at any time.
        It is inappropriate to use Internet-Drafts as reference material or to cite
        them other than as &#8220;work in progress&#8221;.
      </t>
      <xsl:if test="$id-boilerplate=''">
        <t>
          The list of current Internet-Drafts can be accessed at
          <eref target='http://www.ietf.org/ietf/1id-abstracts.txt'>http://www.ietf.org/ietf/1id-abstracts.txt</eref>.
        </t>
        <t>
          The list of Internet-Draft Shadow Directories can be accessed at
          <eref target='http://www.ietf.org/shadow.html'>http://www.ietf.org/shadow.html</eref>.
        </t>
      </xsl:if>
      <t>
        This Internet-Draft will expire <xsl:call-template name="expirydate"><xsl:with-param name="in-prose" select="true()"/></xsl:call-template>.
      </t>
    </xsl:when>

    <xsl:when test="@category='bcp' and $rfc-boilerplate='2010'">
      <t>
        This memo documents an Internet Best Current Practice.
      </t>
    </xsl:when>
    <xsl:when test="@category='bcp'">
      <t>
        This document specifies an Internet Best Current Practices for the Internet
        Community, and requests discussion and suggestions for improvements.
        Distribution of this memo is unlimited.
      </t>
    </xsl:when>
    <xsl:when test="@category='exp' and $rfc-boilerplate='2010'">
      <t>
        This document is not an Internet Standards Track specification; it is
        published for examination, experimental implementation, and evaluation.
      </t>
    </xsl:when>
    <xsl:when test="@category='exp'">
      <t>
        This memo defines an Experimental Protocol for the Internet community.
        It does not specify an Internet standard of any kind.
        Discussion and suggestions for improvement are requested.
        Distribution of this memo is unlimited.
      </t>
    </xsl:when>
    <xsl:when test="@category='historic' and $rfc-boilerplate='2010'">
      <t>
        This document is not an Internet Standards Track specification; it is
        published for the historical record.
      </t>
    </xsl:when>
    <xsl:when test="@category='historic'">
      <t>
        This memo describes a historic protocol for the Internet community.
        It does not specify an Internet standard of any kind.
        Distribution of this memo is unlimited.
      </t>
    </xsl:when>
    <xsl:when test="@category='std' and $rfc-boilerplate='2010'">
      <t>
        This is an Internet Standards Track document.
      </t>
    </xsl:when>
    <xsl:when test="@category='std'">
      <t>
        This document specifies an Internet standards track protocol for the Internet
        community, and requests discussion and suggestions for improvements.
        Please refer to the current edition of the &#8220;Internet Official Protocol
        Standards&#8221; (STD 1) for the standardization state and status of this
        protocol. Distribution of this memo is unlimited.
      </t>
    </xsl:when>
    <xsl:when test="(@category='info' or not(@category)) and $rfc-boilerplate='2010'">
      <t>
        This document is not an Internet Standards Track specification; it is
        published for informational purposes.
      </t>
    </xsl:when>
    <xsl:when test="@category='info' or not(@category)">
      <t>
        This memo provides information for the Internet community.
        It does not specify an Internet standard of any kind.
        Distribution of this memo is unlimited.
      </t>
    </xsl:when>
    <xsl:otherwise>
      <t>
        UNSUPPORTED CATEGORY.
      </t>
      <xsl:call-template name="error">
        <xsl:with-param name="msg" select="concat('Unsupported value for /rfc/@category: ', @category)"/>
        <xsl:with-param name="inline" select="'no'"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>

  <!-- 2nd and 3rd paragraph -->
  <xsl:if test="$rfc-boilerplate='2010' and $is-rfc">
    <t>
      <xsl:if test="@category='exp'">
        This document defines an Experimental Protocol for the Internet
        community.
      </xsl:if>
      <xsl:if test="@category='historic'">
        This document defines a Historic Document for the Internet community.
      </xsl:if>
      <xsl:choose>
        <xsl:when test="$submissionType='IETF'">
          This document is a product of the Internet Engineering Task Force
          (IETF).
          <xsl:choose>
            <xsl:when test="$consensus='yes'">
              It represents the consensus of the IETF community.  It has
              received public review and has been approved for publication by
              the Internet Engineering Steering Group (IESG).
            </xsl:when>
            <xsl:otherwise>
              It has been approved for publication by the Internet Engineering
              Steering Group (IESG).
              <!-- sanity check of $consensus -->
              <xsl:if test="@category='std' or @category='bcp'">
                <xsl:call-template name="error">
                  <xsl:with-param name="msg" select="'IETF BCPs and Standards Track documents require IETF consensus, check values of @category and @consensus!'"/>
                  <xsl:with-param name="inline" select="'no'"/>
                </xsl:call-template>
              </xsl:if>
            </xsl:otherwise>
          </xsl:choose>
        </xsl:when>
        <xsl:when test="$submissionType='IAB'">
          This document is a product of the Internet Architecture Board (IAB)
          and represents information that the IAB has deemed valuable to
          provide for permanent record.
          <xsl:if test="$consensus='yes'">
            It represents the consensus of the Internet Architecture Board (IAB).
          </xsl:if>
        </xsl:when>
        <xsl:when test="$submissionType='IRTF'">
          This document is a product of the Internet Research Task Force (IRTF).
          The IRTF publishes the results of Internet-related research and
          development activities.  These results might not be suitable for
          deployment.
          <xsl:choose>
            <xsl:when test="$consensus='yes' and front/workgroup[1]!=''">
              This RFC represents the consensus of the
              <xsl:value-of select="front/workgroup[1]"/> Research Group of the Internet
              Research Task Force (IRTF).
            </xsl:when>
            <xsl:when test="$consensus='no' and front/workgroup[1]!=''">
              This RFC represents the individual opinion(s) of one or more
              members of the <xsl:value-of select="front/workgroup[1]"/> Research Group of the
              Internet Research Task Force (IRTF).
            </xsl:when>
            <xsl:otherwise>
              <!-- no research group -->
            </xsl:otherwise>
          </xsl:choose>
        </xsl:when>
        <xsl:when test="$submissionType='independent'">
          This is a contribution to the RFC Series, independently of any other
          RFC stream.  The RFC Editor has chosen to publish this document at
          its discretion and makes no statement about its value for
          implementation or deployment.
        </xsl:when>
        <xsl:otherwise>
          <!-- will contain error message already -->
          <xsl:value-of select="$submissionType"/>
        </xsl:otherwise>
      </xsl:choose>
      <xsl:variable name="candidates">
        <!-- see https://www.rfc-editor.org/errata/eid5248 -->
        <xsl:choose>
          <xsl:when test="$pub-yearmonth &lt; 201802">a candidate</xsl:when>
          <xsl:otherwise>candidates</xsl:otherwise>
        </xsl:choose>
      </xsl:variable>
      <xsl:choose>
        <xsl:when test="$submissionType='IETF'">
          <xsl:choose>
            <xsl:when test="@category='bcp'">
              Further information on BCPs is available in <xsl:copy-of select="$hab-reference"/>.
            </xsl:when>
            <xsl:when test="@category='std'">
              Further information on Internet Standards is available in <xsl:copy-of select="$hab-reference"/>.
            </xsl:when>
            <xsl:otherwise>
              Not all documents approved by the IESG are <xsl:value-of select="$candidates"/> for any
              level of Internet Standard; see <xsl:copy-of select="$hab-reference"/>.
            </xsl:otherwise>
          </xsl:choose>
        </xsl:when>
        <xsl:otherwise>
          <xsl:variable name="approver">
            <xsl:choose>
              <xsl:when test="$submissionType='IAB'">IAB</xsl:when>
              <xsl:when test="$submissionType='IRTF'">IRSG</xsl:when>
              <xsl:otherwise>RFC Editor</xsl:otherwise>
            </xsl:choose>
          </xsl:variable>

          Documents approved for publication by the
          <xsl:value-of select="$approver"/> are not <xsl:value-of select="$candidates"/> for any level
          of Internet Standard; see <xsl:copy-of select="$hab-reference"/>.
        </xsl:otherwise>
      </xsl:choose>
    </t>
    <t>
      Information about the current status of this document, any errata, and
      how to provide feedback on it may be obtained at
      <eref target="{$rfc-info-link}"><xsl:value-of select="$rfc-info-link"/></eref>.
    </t>
  </xsl:if>

  </section>

  <!-- some notes might go here; see http://www.rfc-editor.org/rfc-style-guide/rfc-style -->
  <xsl:copy-of select="$notes"/>

  <xsl:choose>
    <xsl:when test="$src/rfc/@ipr='none'"/>
    <xsl:when test="$ipr-2008-11">
      <section anchor="{$anchor-pref}copyrightnotice">
        <name>Copyright Notice</name>
        <t>
          Copyright (c) <xsl:value-of select="$xml2rfc-ext-pub-year" /> IETF Trust and the persons identified
          as the document authors.  All rights reserved.
        </t>
        <xsl:choose>
          <xsl:when test="$ipr-2010-01">
            <t>
              This document is subject to BCP 78 and the IETF Trust's Legal
              Provisions Relating to IETF Documents (<eref target="{$trust-license-info-link}"><xsl:value-of select="$trust-license-info-link"/></eref>)
              in effect on the date of publication of this document. Please
              review these documents carefully, as they describe your rights
              and restrictions with respect to this document.
              <xsl:if test="$submissionType='IETF'">
                Code Components extracted from this document must include
                Simplified BSD License text as described in Section 4.e of the
                Trust Legal Provisions and are provided without warranty as
                described in the Simplified BSD License.
              </xsl:if>
            </t>
          </xsl:when>
          <xsl:when test="$ipr-2009-09">
            <t>
              This document is subject to BCP 78 and the IETF Trust's Legal
              Provisions Relating to IETF Documents (<eref target="http://trustee.ietf.org/license-info">http://trustee.ietf.org/license-info</eref>)
              in effect on the date of publication of this document. Please
              review these documents carefully, as they describe your rights
              and restrictions with respect to this document. Code Components
              extracted from this document must include Simplified BSD License
              text as described in Section 4.e of the Trust Legal Provisions
              and are provided without warranty as described in the BSD License.
            </t>
          </xsl:when>
          <xsl:when test="$ipr-2009-02">
            <t>
              This document is subject to BCP 78 and the IETF Trust's Legal
              Provisions Relating to IETF Documents in effect on the date of
              publication of this document
              (<eref target="http://trustee.ietf.org/license-info">http://trustee.ietf.org/license-info</eref>).
              Please review these documents carefully, as they describe your rights and restrictions with
              respect to this document.
            </t>
          </xsl:when>
          <xsl:otherwise>
            <t>
              This document is subject to BCP 78 and the IETF Trust's Legal
              Provisions Relating to IETF Documents
              (<eref target="http://trustee.ietf.org/license-info">http://trustee.ietf.org/license-info</eref>) in effect on the date of
              publication of this document.  Please review these documents
              carefully, as they describe your rights and restrictions with respect
              to this document.
            </t>
          </xsl:otherwise>
        </xsl:choose>

        <!-- add warning for incompatible IPR attribute on RFCs -->
        <xsl:variable name="stds-rfc-compatible-ipr"
                      select="@ipr='pre5378Trust200902' or @ipr='trust200902' or @ipr='trust200811' or @ipr='full3978' or @ipr='full3667' or @ipr='full2026'"/>

        <xsl:variable name="rfc-compatible-ipr"
                      select="$stds-rfc-compatible-ipr or @ipr='noModificationTrust200902' or @ipr='noDerivativesTrust200902' or @ipr='noModificationTrust200811' or @ipr='noDerivativesTrust200811'"/>
                      <!-- TODO: may want to add more historic variants -->

        <xsl:variable name="is-stds-track"
                      select="$submissionType='IETF' and @category='std'"/>

        <xsl:variable name="status-diags">
          <xsl:choose>
            <xsl:when test="$is-stds-track and $is-rfc and @ipr and not($stds-rfc-compatible-ipr)">
              <xsl:value-of select="concat('The /rfc/@ipr attribute value of ',@ipr,' is not allowed on standards-track RFCs.')"/>
            </xsl:when>
            <xsl:when test="$is-rfc and @ipr and not($rfc-compatible-ipr)">
              <xsl:value-of select="concat('The /rfc/@ipr attribute value of ',@ipr,' is not allowed on RFCs.')"/>
            </xsl:when>
            <xsl:otherwise/>
          </xsl:choose>
        </xsl:variable>

        <xsl:choose>
          <xsl:when test="$status-diags!=''">
            <t>
              <spanx><xsl:value-of select="$status-diags"/></spanx>
            </t>
            <xsl:call-template name="error">
              <xsl:with-param name="msg" select="$status-diags"/>
              <xsl:with-param name="inline" select="'no'"/>
            </xsl:call-template>
          </xsl:when>
          <xsl:when test="($is-rfc or $pub-yearmonth >= 200911) and @ipr = 'pre5378Trust200902'">
          <!-- special case: RFC5378 escape applies to RFCs as well -->
          <!-- for IDs historically in Status Of This Memo, over here starting 2009-11 -->
            <t>
              <xsl:value-of select="$pre5378EscapeClause"/>
            </t>
          </xsl:when>
          <xsl:when test="not($is-rfc)">
            <!-- not an RFC, handled elsewhere -->
          </xsl:when>
          <xsl:when test="not(@ipr)">
            <!-- no IPR value; done -->
          </xsl:when>
          <xsl:when test="@ipr='trust200902' or @ipr='trust200811' or @ipr='full3978' or @ipr='full3667' or @ipr='full2026'">
            <!-- default IPR, allowed here -->
          </xsl:when>
          <xsl:when test="@ipr='noModificationTrust200811'">
            <t>
              <xsl:value-of select="$noModificationTrust200811Clause"/>
            </t>
          </xsl:when>
          <xsl:when test="@ipr='noModificationTrust200902'">
            <t>
              <xsl:value-of select="$noModificationTrust200902Clause"/>
            </t>
          </xsl:when>
          <xsl:when test="@ipr='noDerivativesTrust200902' or @ipr='noDerivativesTrust200811'">
            <t>
              <xsl:value-of select="$noDerivativesTrust200___Clause"/>
            </t>
          </xsl:when>
          <xsl:otherwise>
            <xsl:variable name="msg" select="concat('unexpected value of /rfc/@ipr for this type of document: ',@ipr)"/>
            <t>
              <spanx><xsl:value-of select="$msg"/></spanx>
            </t>
            <xsl:call-template name="error">
              <xsl:with-param name="msg" select="$msg"/>
              <xsl:with-param name="inline" select="'no'"/>
            </xsl:call-template>
          </xsl:otherwise>
        </xsl:choose>

      </section>
    </xsl:when>
    <xsl:when test="$ipr-2007-08">
      <!-- no copyright notice -->
    </xsl:when>
    <xsl:when test="$ipr-rfc4748">
      <section anchor="{$anchor-pref}copyrightnotice">
        <name>Copyright Notice</name>
        <t>
          Copyright &#169; The IETF Trust (<xsl:value-of select="$xml2rfc-ext-pub-year" />).  All Rights Reserved.
        </t>
      </section>
    </xsl:when>
    <xsl:otherwise>
      <section anchor="{$anchor-pref}copyrightnotice">
        <name>Copyright Notice</name>
        <t>
          Copyright &#169; The Internet Society (<xsl:value-of select="$xml2rfc-ext-pub-year" />).  All Rights Reserved.
        </t>
      </section>
    </xsl:otherwise>
  </xsl:choose>
</boilerplate>

</xsl:template>

<!-- TOC generation -->

<xsl:template match="/" mode="toc">
  <hr class="{$css-noprint}"/>

  <nav id="{$anchor-pref}toc">
    <xsl:call-template name="insert-errata">
      <xsl:with-param name="section" select="'toc'"/>
    </xsl:call-template>

    <h2 class="np"> <!-- this pagebreak occurs always -->
      <a href="#{$anchor-pref}toc">Table of Contents</a>
    </h2>

    <ul class="toc">
      <xsl:apply-templates mode="toc" />
    </ul>

    <xsl:call-template name="insertTocAppendix" />
  </nav>
</xsl:template>

<xsl:template name="insert-toc-line">
  <xsl:param name="number" />
  <xsl:param name="target" />
  <xsl:param name="title" />
  <xsl:param name="name" />
  <xsl:param name="tocparam" />
  <xsl:param name="oldtitle" />
  <xsl:param name="waschanged" />

  <xsl:variable name="depth">
    <!-- count the dots -->
    <xsl:choose>
      <xsl:when test="starts-with($number,$unnumbered)">
        <xsl:value-of select="string-length(translate(substring-after($number,$unnumbered),'.ABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890&#167;','.'))"/>
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="string-length(translate($number,'.ABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890&#167;','.'))"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  
  <!-- handle tocdepth parameter -->
  <xsl:choose>
    <xsl:when test="(not($tocparam) or $tocparam='' or $tocparam='default') and $depth >= $parsedTocDepth">
      <!-- dropped entry because excluded -->
      <xsl:attribute name="class">excluded</xsl:attribute>
    </xsl:when>
    <xsl:when test="$tocparam='exclude'">
      <!-- dropped entry because excluded -->
      <xsl:attribute name="class">excluded</xsl:attribute>
    </xsl:when>
    <xsl:otherwise>
      <xsl:choose>
        <xsl:when test="starts-with($number,'del-')">
          <del>
            <xsl:value-of select="$number" />
            <a href="#{$target}"><xsl:value-of select="$title"/></a>
          </del>
        </xsl:when>
        <xsl:otherwise>
          <xsl:if test="$number != '' and not(contains($number,$unnumbered))">
            <a href="#{$anchor-pref}section.{$number}">
              <xsl:call-template name="emit-section-number">
                <xsl:with-param name="no" select="$number"/>
                <xsl:with-param name="appendixPrefix" select="true()"/>
              </xsl:call-template>
            </a>
            <xsl:text>&#160;&#160;&#160;</xsl:text>
          </xsl:if>
          <a href="#{$target}">
            <xsl:choose>
              <xsl:when test="$waschanged!=''">
                <ins><xsl:value-of select="$title"/></ins>
                <del><xsl:value-of select="$oldtitle"/></del>
              </xsl:when>
              <xsl:when test="$name">
                <xsl:call-template name="render-name-ref">
                  <xsl:with-param name="n" select="$name/node()"/>
                </xsl:call-template>
              </xsl:when>
              <xsl:otherwise>
                <xsl:value-of select="$title"/>
              </xsl:otherwise>
            </xsl:choose>
          </a>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="back-toc">

  <xsl:if test="//cref and $xml2rfc-comments='yes' and $xml2rfc-inline!='yes'">
    <li>
      <xsl:call-template name="insert-toc-line">
        <xsl:with-param name="target" select="concat($anchor-pref,'comments')"/>
        <xsl:with-param name="title" select="'Editorial Comments'"/>
      </xsl:call-template>
    </li>
  </xsl:if>

  <xsl:if test="$xml2rfc-ext-authors-section='before-appendices'">
    <xsl:apply-templates select="/rfc/front" mode="toc" />
  </xsl:if>
  <xsl:apply-templates select="back/*[not(self::references)]" mode="toc" />

  <!-- insert the index if index entries exist -->
  <xsl:if test="$has-index">
    <li>
      <xsl:call-template name="insert-toc-line">
        <xsl:with-param name="target" select="concat($anchor-pref,'index')"/>
        <xsl:with-param name="title" select="'Index'"/>
      </xsl:call-template>
    </li>
  </xsl:if>

  <xsl:if test="$xml2rfc-ext-authors-section='end'">
    <xsl:apply-templates select="/rfc/front" mode="toc" />
  </xsl:if>

  <!-- copyright statements -->
  <xsl:if test="$xml2rfc-private='' and not($no-copylong)">
    <li>
      <xsl:call-template name="insert-toc-line">
        <xsl:with-param name="target" select="concat($anchor-pref,'ipr')"/>
        <xsl:with-param name="title" select="'Intellectual Property and Copyright Statements'"/>
      </xsl:call-template>
    </li>
  </xsl:if>

</xsl:template>

<xsl:template match="front" mode="toc">

  <xsl:variable name="authors-title">
    <xsl:call-template name="get-authors-section-title"/>
  </xsl:variable>
  <xsl:variable name="authors-number">
    <xsl:call-template name="get-authors-section-number"/>
  </xsl:variable>

  <xsl:if test="$authors-number!='suppress' and $xml2rfc-authorship!='no'">
    <li>
      <xsl:call-template name="insert-toc-line">
        <xsl:with-param name="target" select="concat($anchor-pref,'authors')"/>
        <xsl:with-param name="title" select="$authors-title"/>
        <xsl:with-param name="number" select="$authors-number"/>
      </xsl:call-template>
    </li>
  </xsl:if>

</xsl:template>

<xsl:template name="references-toc">

  <!-- distinguish two cases: (a) single references element (process
  as toplevel section; (b) multiple references sections (add one toplevel
  container with subsection) -->

  <xsl:variable name="refsecs" select="/rfc/back/references|/rfc/back/ed:replace/ed:ins/references"/>

  <xsl:choose>
    <xsl:when test="count($refsecs) = 0">
      <!-- nop -->
    </xsl:when>
    <xsl:when test="count($refsecs) = 1">
      <xsl:for-each select="$refsecs">
        <xsl:variable name="title">
          <xsl:choose>
            <xsl:when test="@title!=''"><xsl:value-of select="@title" /></xsl:when>
            <xsl:otherwise><xsl:value-of select="$xml2rfc-refparent"/></xsl:otherwise>
          </xsl:choose>
        </xsl:variable>

        <li>
          <xsl:call-template name="insert-toc-line">
            <xsl:with-param name="number">
              <xsl:call-template name="get-references-section-number"/>
            </xsl:with-param>
            <xsl:with-param name="target" select="concat($anchor-pref,'references')"/>
            <xsl:with-param name="title" select="$title"/>
            <xsl:with-param name="name" select="name"/>
          </xsl:call-template>

          <xsl:if test="references">
            <ul>
              <xsl:for-each select="references">
                <xsl:call-template name="references-toc-entry"/>
              </xsl:for-each>
            </ul>
          </xsl:if>
        </li>
      </xsl:for-each>
    </xsl:when>
    <xsl:otherwise>
      <li>
        <!-- insert pseudo container -->
        <xsl:call-template name="insert-toc-line">
          <xsl:with-param name="number">
            <xsl:call-template name="get-references-section-number"/>
          </xsl:with-param>
          <xsl:with-param name="target" select="concat($anchor-pref,'references')"/>
          <xsl:with-param name="title" select="$xml2rfc-refparent"/>
        </xsl:call-template>

        <ul>
          <!-- ...with subsections... -->
          <xsl:for-each select="$refsecs">
            <xsl:call-template name="references-toc-entry"/>
          </xsl:for-each>
        </ul>
      </li>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="references-toc-entry">
  <xsl:variable name="title">
    <xsl:choose>
      <xsl:when test="@title!=''"><xsl:value-of select="@title" /></xsl:when>
      <xsl:otherwise><xsl:value-of select="$xml2rfc-refparent"/></xsl:otherwise>
    </xsl:choose>
  </xsl:variable>

  <xsl:variable name="sectionNumber">
    <xsl:call-template name="get-section-number" />
  </xsl:variable>

  <xsl:variable name="num">
    <xsl:number level="any"/>
  </xsl:variable>

  <li>
    <xsl:call-template name="insert-toc-line">
      <xsl:with-param name="number" select="$sectionNumber"/>
      <xsl:with-param name="target" select="concat($anchor-pref,'references','.',$num)"/>
      <xsl:with-param name="title" select="$title"/>
      <xsl:with-param name="name" select="name"/>
    </xsl:call-template>

    <xsl:if test="references">
      <ul>
        <xsl:for-each select="references">
          <xsl:call-template name="references-toc-entry"/>
        </xsl:for-each>
      </ul>
    </xsl:if>
  </li>
</xsl:template>

<!-- suppress xml2rfc preptool artefacts -->
<xsl:template match="section[author]" mode="toc"/>

<xsl:template match="section|appendix" mode="toc">
  <xsl:variable name="sectionNumber">
    <xsl:call-template name="get-section-number" />
  </xsl:variable>

  <xsl:variable name="target">
    <xsl:choose>
      <xsl:when test="@anchor"><xsl:value-of select="@anchor" /></xsl:when>
       <xsl:otherwise><xsl:value-of select="$anchor-pref"/>section.<xsl:value-of select="$sectionNumber" /></xsl:otherwise>
    </xsl:choose>
  </xsl:variable>

  <!-- obtain content, just to check whether we need to recurse at all -->
  <xsl:variable name="content">
    <li>
      <xsl:call-template name="insert-toc-line">
        <xsl:with-param name="number" select="$sectionNumber"/>
        <xsl:with-param name="target" select="$target"/>
        <xsl:with-param name="title" select="@title"/>
        <xsl:with-param name="name" select="name"/>
        <xsl:with-param name="tocparam" select="@toc"/>
        <xsl:with-param name="oldtitle" select="@ed:old-title"/>
        <xsl:with-param name="waschanged" select="@ed:resolves"/>
      </xsl:call-template>

      <ul>
        <xsl:apply-templates mode="toc" />
      </ul>
    </li>
  </xsl:variable>

  <xsl:if test="$content!=''">
    <li>
      <xsl:call-template name="insert-toc-line">
        <xsl:with-param name="number" select="$sectionNumber"/>
        <xsl:with-param name="target" select="$target"/>
        <xsl:with-param name="title" select="@title"/>
        <xsl:with-param name="name" select="name"/>
        <xsl:with-param name="tocparam" select="@toc"/>
        <xsl:with-param name="oldtitle" select="@ed:old-title"/>
        <xsl:with-param name="waschanged" select="@ed:resolves"/>
      </xsl:call-template>

      <!-- obtain nested content, just to check whether we need to recurse at all -->
      <xsl:variable name="nested-content">
        <ul>
          <xsl:apply-templates mode="toc" />
        </ul>
      </xsl:variable>

      <!-- only recurse if we need to (do not produce useless list container) -->
      <xsl:if test="$nested-content!=''">
        <ul>
          <xsl:apply-templates mode="toc" />
        </ul>
      </xsl:if>
    </li>
  </xsl:if>
</xsl:template>

<xsl:template match="middle" mode="toc">
  <xsl:apply-templates mode="toc" />
  <xsl:call-template name="references-toc" />
</xsl:template>

<xsl:template match="rfc" mode="toc">
  <xsl:apply-templates select="middle" mode="toc" />
  <xsl:call-template name="back-toc" />
</xsl:template>

<xsl:template match="ed:del|ed:ins|ed:replace" mode="toc">
  <xsl:apply-templates mode="toc" />
</xsl:template>

<xsl:template match="*|text()" mode="toc" />


<xsl:template name="insertTocAppendix">

  <xsl:if test="//figure[@title!='' or @anchor!='' or name]">
    <ul class="toc">
      <li>
        <xsl:text>Figures</xsl:text>
        <ul>
          <xsl:for-each select="//figure[@title!='' or @anchor!='' or name]">
            <xsl:variable name="n"><xsl:call-template name="get-figure-number"/></xsl:variable>
            <xsl:variable name="title">
              <xsl:if test="not(starts-with($n,'u'))">
                <xsl:text>Figure </xsl:text>
                <xsl:value-of select="$n"/>
                <xsl:if test="@title!='' or name">: </xsl:if>
              </xsl:if>
              <xsl:choose>
                <xsl:when test="name">
                  <xsl:call-template name="render-name-ref">
                    <xsl:with-param name="n" select="name/node()"/>
                  </xsl:call-template>
                </xsl:when>
                <xsl:otherwise>
                  <xsl:value-of select="normalize-space(@title)" />
                </xsl:otherwise>
              </xsl:choose>
            </xsl:variable>
            <li>
              <xsl:call-template name="insert-toc-line">
                <xsl:with-param name="target" select="concat($anchor-pref,'figure.',$n)" />
                <xsl:with-param name="title" select="$title" />
              </xsl:call-template>
            </li>
          </xsl:for-each>
        </ul>
      </li>
    </ul>
  </xsl:if>

  <!-- experimental -->
  <xsl:if test="//ed:issue">
    <xsl:call-template name="insertIssuesList" />
  </xsl:if>

</xsl:template>

<xsl:template name="reference-name">
  <xsl:param name="node" select="."/>

  <xsl:for-each select="$node">
    <xsl:choose>
      <xsl:when test="$xml2rfc-symrefs!='no' and ancestor::ed:del">
        <xsl:variable name="unprefixed" select="substring-after(@anchor,'deleted-')"/>
        <xsl:choose>
          <xsl:when test="$unprefixed!=''">
            <xsl:value-of select="concat('[',$unprefixed,']')"/>
          </xsl:when>
          <xsl:otherwise>
            <xsl:if test="count(//reference[@anchor=current()/@anchor])!=1">
              <xsl:message>Deleted duplicate anchors should have the prefix "deleted-": <xsl:value-of select="@anchor"/></xsl:message>
            </xsl:if>
            <xsl:value-of select="concat('[',@anchor,']')"/>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:when>
      <xsl:when test="$xml2rfc-symrefs!='no'">
        <xsl:text>[</xsl:text>
        <xsl:choose>
          <xsl:when test="$src/rfc/back/displayreference[@target=current()/@anchor]">
            <xsl:value-of select="$src/rfc/back/displayreference[@target=current()/@anchor]/@to"/>
          </xsl:when>
          <xsl:otherwise>
            <xsl:value-of select="@anchor"/>
          </xsl:otherwise>
        </xsl:choose>
        <xsl:text>]</xsl:text>
      </xsl:when>
      <xsl:when test="ancestor::ed:del">
        <xsl:text>[del]</xsl:text>
      </xsl:when>
      <xsl:otherwise>[<xsl:number level="any" count="reference[not(ancestor::ed:del)]"/>]</xsl:otherwise>
    </xsl:choose>
  </xsl:for-each>
</xsl:template>



<xsl:template name="replace-substring">
  <xsl:param name="string" />
  <xsl:param name="replace" />
  <xsl:param name="by" />

  <xsl:choose>
    <xsl:when test="contains($string,$replace)">
      <xsl:value-of select="concat(substring-before($string, $replace),$by)" />
      <xsl:call-template name="replace-substring">
        <xsl:with-param name="string" select="substring-after($string,$replace)" />
        <xsl:with-param name="replace" select="$replace" />
        <xsl:with-param name="by" select="$by" />
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise><xsl:value-of select="$string" /></xsl:otherwise>
  </xsl:choose>

</xsl:template>

<xsl:template name="rfc-or-id-link">
  <xsl:param name="name" />

  <xsl:choose>
    <xsl:when test="starts-with($name,'draft-')">
      <xsl:variable name="uri">
        <xsl:call-template name="compute-internet-draft-uri">
          <xsl:with-param name="internet-draft" select="$name"/>
        </xsl:call-template>
      </xsl:variable>
      <a href="{$uri}"><xsl:value-of select="$name"/></a>
      <xsl:call-template name="check-front-matter-ref">
        <xsl:with-param name="name" select="$name"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:when test="string(number($name))=$name">
      <xsl:variable name="uri">
        <xsl:variable name="refs" select="exslt:node-set($includeDirectives)//reference|/rfc/back/references//reference"/>
        <xsl:variable name="ref" select="$refs[not(starts-with(front/title,'Erratum ID')) and seriesInfo[@name='RFC' and @value=$name]]"/>
        <xsl:choose>
          <xsl:when test="$ref">
            <xsl:value-of select="concat('#',$ref/@anchor)"/>
          </xsl:when>
          <xsl:otherwise>
            <xsl:call-template name="compute-rfc-uri">
              <xsl:with-param name="rfc" select="$name"/>
            </xsl:call-template>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:variable>
      <a href="{$uri}"><xsl:value-of select="$name"/></a>
      <xsl:call-template name="check-front-matter-ref">
        <xsl:with-param name="name" select="$name"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="$name"/>
      <xsl:call-template name="warning">
        <xsl:with-param name="msg" select="concat('In metadata obsoletes/updates, RFC number of draft name is expected - found: ',$name)"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="rfclist">
  <xsl:param name="list" />
  <xsl:choose>
    <xsl:when test="contains($list,',')">
      <xsl:variable name="rfcNo" select="substring-before($list,',')" />
      <xsl:call-template name="rfc-or-id-link">
        <xsl:with-param name="name" select="$rfcNo"/>
      </xsl:call-template>
      <xsl:text>, </xsl:text>
      <xsl:call-template name="rfclist">
        <xsl:with-param name="list" select="normalize-space(substring-after($list,','))" />
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:variable name="rfcNo" select="$list" />
      <xsl:call-template name="rfc-or-id-link">
        <xsl:with-param name="name" select="$rfcNo"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="check-front-matter-ref">
  <xsl:param name="name"/>
  <xsl:variable name="refs" select="exslt:node-set($includeDirectives)//reference|/rfc/back/references//reference"/>
  <xsl:choose>
    <xsl:when test="starts-with($name,'draft-')">
      <xsl:if test="not($refs//seriesInfo[@name='Internet-Draft' and @value=$name])">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg" select="concat('front matter mentions I-D ',$name,' for which there is no reference element')"/>
        </xsl:call-template>
      </xsl:if>
    </xsl:when>
    <xsl:otherwise>
      <xsl:variable name="ref" select="$refs[not(starts-with(front/title,'Erratum ID')) and seriesInfo[@name='RFC' and @value=$name]]"/>
      <xsl:if test="not($ref)">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg" select="concat('front matter mentions RFC ',$name,' for which there is no reference element')"/>
        </xsl:call-template>
      </xsl:if>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="check-anchor">
  <xsl:if test="@anchor and @anchor!=''">
    <!-- check validity of anchor name -->
    <xsl:variable name="t" select="@anchor"/>
    <xsl:variable name="tstart" select="substring($t,1,1)"/>

    <!-- we only check for disallowed ASCII characters for now -->
    <xsl:variable name="not-namestartchars">&#9;&#10;&#13;&#32;!"#$%&amp;'()*+,-./0123456789;&lt;=&gt;?@[\]^`[|}~</xsl:variable>

    <xsl:if test="$tstart!=translate($tstart,$not-namestartchars,'')">
      <xsl:call-template name="error">
        <xsl:with-param name="msg" select="concat('anchor &quot;',$t,'&quot; can not start with character &quot;',$tstart,'&quot;')"/>
      </xsl:call-template>
    </xsl:if>
    <xsl:call-template name="check-anchor-non-start">
      <xsl:with-param name="f" select="$t"/>
      <xsl:with-param name="t" select="$t"/>
    </xsl:call-template>
  </xsl:if>
</xsl:template>

<xsl:template name="check-anchor-non-start">
  <xsl:param name="f"/>
  <xsl:param name="t"/>

  <xsl:variable name="not-namechars">&#9;&#10;&#13;&#32;!"#$%&amp;'()*+,/;&lt;=&gt;?@[\]^`[|}~</xsl:variable>

  <xsl:choose>
    <xsl:when test="$t=''">
      <!-- Done -->
    </xsl:when>
    <xsl:otherwise>
      <xsl:variable name="s" select="substring($t,1,1)"/>
      <xsl:choose>
        <xsl:when test="$s!=translate($s,$not-namechars,'')">
          <xsl:call-template name="error">
            <xsl:with-param name="msg" select="concat('anchor &quot;',$f,'&quot; contains invalid character &quot;',$s,'&quot; at position ',string-length($f) - string-length($t))"/>
          </xsl:call-template>
        </xsl:when>
        <xsl:otherwise>
          <xsl:call-template name="check-anchor-non-start">
            <xsl:with-param name="f" select="$f"/>
            <xsl:with-param name="t" select="substring($t,2)"/>
          </xsl:call-template>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="sluggy-anchor">
  <xsl:if test="self::section and (not(@anchor) or @anchor='')">
    <xsl:variable name="fr">ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.'"()+-_ :!%,/@=&lt;&gt;*&#8212;&#8232;</xsl:variable>
    <xsl:variable name="to">abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz0123456789.__----_--.-------.--</xsl:variable>
    <xsl:variable name="canslug" select="translate(normalize-space(concat(@title,name)),$fr,'')=''"/>
    <xsl:if test="$canslug">
      <xsl:variable name="slug" select="translate(normalize-space(concat(@title,name)),$fr,$to)"/>
      <xsl:variable name="conflicts" select="//section[not(@anchor) and $slug=translate(normalize-space(concat(@title,name)),$fr,$to)]"/>
      <xsl:choose>
        <xsl:when test="count($conflicts)>1">
          <xsl:variable name="c" select="preceding::*[not(@anchor) and $slug=translate(normalize-space(concat(@title,name)),$fr,$to)]"/>
          <xsl:value-of select="concat('n-',$slug,'_',(1+count($c)))"/>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="concat('n-',$slug)"/>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:if>
  </xsl:if>
</xsl:template>

<xsl:template name="copy-anchor">
  <xsl:call-template name="check-anchor"/>
  <xsl:choose>
    <xsl:when test="@anchor and @anchor!=''">
      <xsl:attribute name="id"><xsl:value-of select="@anchor"/></xsl:attribute>
    </xsl:when>
    <xsl:when test="self::section">
      <xsl:variable name="slug">
        <xsl:call-template name="sluggy-anchor"/>
      </xsl:variable>
      <xsl:if test="$slug!=''">
        <xsl:attribute name="id"><xsl:value-of select="$slug"/></xsl:attribute>
      </xsl:if>
    </xsl:when>
    <xsl:otherwise/>
  </xsl:choose>
</xsl:template>

<xsl:template name="rfclist-for-dcmeta">
  <xsl:param name="list" />
  <xsl:choose>
    <xsl:when test="contains($list,',')">
      <xsl:variable name="rfcNo" select="substring-before($list,',')" />
      <meta name="dct.replaces" content="urn:ietf:rfc:{$rfcNo}" />
      <xsl:call-template name="rfclist-for-dcmeta">
        <xsl:with-param name="list" select="normalize-space(substring-after($list,','))" />
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:variable name="rfcNo" select="$list" />
      <meta name="dct.replaces" content="urn:ietf:rfc:{$rfcNo}" />
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="get-paragraph-number">
  <xsl:choose>
    <!-- inside artset -->
    <xsl:when test="parent::artset">
      <xsl:for-each select="..">
        <xsl:call-template name="get-paragraph-number"/>
      </xsl:for-each>
    </xsl:when>

    <!-- no numbering inside certain containers -->
    <xsl:when test="ancestor::dl or ancestor::figure or ancestor::ol or ancestor::ul or ancestor::ed:del or ancestor::ed:ins"/>
  
    <xsl:when test="parent::blockquote or parent::x:blockquote">
      <!-- boilerplate -->
      <xsl:for-each select="parent::blockquote|parent::x:blockquote"><xsl:call-template name="get-paragraph-number" />.</xsl:for-each>
      <xsl:number count="artset|artwork|aside|blockquote|dl|ol|sourcecode|t|ul|x:blockquote|x:note"/>
    </xsl:when>

    <xsl:when test="parent::aside or parent::x:note">
      <!-- boilerplate -->
      <xsl:for-each select="parent::aside|parent::x:note"><xsl:call-template name="get-paragraph-number" />.</xsl:for-each>
      <xsl:number count="artset|artwork|aside|blockquote|dl|ol|sourcecode|t|ul|x:blockquote|x:note"/>
    </xsl:when>

    <xsl:when test="ancestor::section">
      <!-- get section number of ancestor section element, then add t number -->
      <xsl:for-each select="ancestor::section[1]"><xsl:call-template name="get-section-number" />.p.</xsl:for-each>
      <xsl:variable name="b"><xsl:number count="artset|artwork|aside|blockquote|dl|ol|sourcecode|t|ul|x:blockquote|x:note"/></xsl:variable>
      <xsl:choose>
        <xsl:when test="parent::section and ../@removeInRFC='true' and ../t[1]!=$section-removeInRFC">
          <xsl:value-of select="1 + $b"/>
        </xsl:when>
        <xsl:otherwise><xsl:value-of select="$b"/></xsl:otherwise>
      </xsl:choose>
    </xsl:when>

    <xsl:when test="ancestor::note">
      <!-- get section number of ancestor note element, then add t number -->
      <xsl:for-each select="ancestor::note[1]"><xsl:call-template name="get-section-number" />.p.</xsl:for-each>
      <xsl:variable name="b"><xsl:number count="artset|artwork|aside|blockquote|dl|ol|sourcecode|t|ul|x:blockquote|x:note"/></xsl:variable>
      <xsl:choose>
        <xsl:when test="parent::note and ../@removeInRFC='true' and ../t[1]!=$note-removeInRFC">
          <xsl:value-of select="1 + $b"/>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="$b"/>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:when>

    <!-- abstract -->
    <xsl:when test="ancestor::abstract">
      <xsl:text>p.</xsl:text>
      <xsl:number count="t|x:blockquote|blockquote|x:note|aside|ul|dl|ol|artwork|artset|sourcecode"/>
    </xsl:when>

    <xsl:otherwise/>
  </xsl:choose>  
</xsl:template>

<xsl:template name="attach-paragraph-number-as-id">
  <xsl:variable name="p">
    <xsl:call-template name="get-paragraph-number"/>
  </xsl:variable>
  <xsl:variable name="container">
    <xsl:choose>
      <xsl:when test="ancestor::abstract">abstract</xsl:when>
      <xsl:when test="ancestor::note">note</xsl:when>
      <xsl:when test="ancestor::boilerplate">boilerplate</xsl:when>
      <xsl:otherwise>section</xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <xsl:if test="$p!='' and not(ancestor::list)">
    <xsl:attribute name="id"><xsl:value-of select="concat($anchor-pref,$container,'.',$p)"/></xsl:attribute>
  </xsl:if>
</xsl:template>

<xsl:template name="editingMark">
  <xsl:if test="$xml2rfc-editing='yes' and ancestor::rfc">
    <sup class="editingmark"><span><xsl:number level="any" count="postamble|preamble|t"/></span>&#0160;</sup>
  </xsl:if>
</xsl:template>

<!-- internal ref support -->
<xsl:key name="anchor-item-alias" match="//*[@anchor and (x:anchor-alias/@value or ed:replace/ed:ins/x:anchor-alias)]" use="x:anchor-alias/@value | ed:replace/ed:ins/x:anchor-alias/@value"/>

<xsl:template match="x:ref">
  <xsl:variable name="val" select="normalize-space(.)"/>
  <xsl:variable name="target" select="key('anchor-item',$val) | key('anchor-item-alias',$val) | //reference/x:source[x:defines=$val]"/>
  <xsl:if test="count($target)>1">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">internal link target for '<xsl:value-of select="."/>' is ambiguous; picking first.</xsl:with-param>
    </xsl:call-template>
  </xsl:if>
  <xsl:choose>
    <xsl:when test="$target[1]/@anchor">
      <a href="#{$target[1]/@anchor}" class="smpl">
        <xsl:call-template name="copy-anchor"/>
        <!-- insert id when a backlink to this xref is needed in the index -->
        <xsl:if test="//iref[@x:for-anchor=$val] | //iref[@x:for-anchor='' and ../@anchor=$val]">
          <xsl:attribute name="id"><xsl:call-template name="compute-extref-anchor"/></xsl:attribute>
        </xsl:if>
        <xsl:value-of select="."/>
      </a>
    </xsl:when>
    <xsl:when test="$target[1]/self::x:source">
      <xsl:variable name="extdoc" select="document($target[1]/@href)"/>
      <xsl:variable name="nodes" select="$extdoc//*[@anchor and (x:anchor-alias/@value=$val)]"/>
      <xsl:choose>
        <xsl:when test="not($nodes)">
          <xsl:call-template name="error">
            <xsl:with-param name="msg">Anchor '<xsl:value-of select="$val"/>' not found in source file '<xsl:value-of select="$target[1]/@href"/>'.</xsl:with-param>
          </xsl:call-template>
          <xsl:value-of select="."/>
        </xsl:when>
        <xsl:otherwise>
          <xsl:variable name="t">
            <xsl:call-template name="computed-auto-target">
              <xsl:with-param name="bib" select="$target[1]/.."/>
              <xsl:with-param name="ref" select="$nodes[1]"/>
            </xsl:call-template>
          </xsl:variable>
          <a href="{$t}" class="smpl">
            <xsl:value-of select="."/>
          </a>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:when>
    <xsl:when test="//x:source">
      <xsl:variable name="ref" select="."/>
      <xsl:variable name="out">
        <!-- try referenced documents one by one -->
        <xsl:for-each select="//reference[x:source]">
          <xsl:variable name="extdoc" select="document(x:source/@href)"/>
          <xsl:variable name="nodes" select="$extdoc//*[@anchor and (x:anchor-alias/@value=$val)]"/>
          <xsl:choose>
            <xsl:when test="not($nodes)">
              <xsl:call-template name="trace">
                <xsl:with-param name="msg">Anchor '<xsl:value-of select="$val"/>' not found in source file '<xsl:value-of select="x:source/@href"/>'.</xsl:with-param>
              </xsl:call-template>
            </xsl:when>
            <xsl:otherwise>
              <xsl:call-template name="info">
                <xsl:with-param name="msg">Anchor '<xsl:value-of select="$val"/>' found in source file '<xsl:value-of select="x:source/@href"/>'.</xsl:with-param>
              </xsl:call-template>
              <xsl:variable name="t">
                <xsl:call-template name="computed-auto-target">
                  <xsl:with-param name="ref" select="$nodes[1]"/>
                </xsl:call-template>
              </xsl:variable>
              <a href="{$t}" class="smpl">
                <xsl:value-of select="$ref"/>
              </a>
            </xsl:otherwise>
          </xsl:choose>
        </xsl:for-each>
      </xsl:variable>
      <xsl:copy-of select="$out"/>
      <xsl:variable name="plainout" select="normalize-space($out)"/>
      <xsl:if test="string-length($plainout)=0">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg">Anchor '<xsl:value-of select="$val"/>' not found anywhere in references.</xsl:with-param>
        </xsl:call-template>
        <xsl:value-of select="$val"/>
      </xsl:if>
      <xsl:if test="string-length($plainout)!=string-length($val)">
        <xsl:call-template name="error">
          <xsl:with-param name="msg">Multiple targets found for anchor '<xsl:value-of select="$val"/>' - need to disambiguate.</xsl:with-param>
        </xsl:call-template>
      </xsl:if>
    </xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">internal link target for '<xsl:value-of select="."/>' does not exist.</xsl:with-param>
      </xsl:call-template>
      <xsl:value-of select="."/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<!-- Nothing to do here -->
<xsl:template match="x:anchor-alias" />

<!-- Quotes -->
<xsl:template match="x:q">
  <q>
    <xsl:copy-of select="@cite"/>
    <xsl:apply-templates/>
  </q>
</xsl:template>

<!-- Notes -->
<xsl:template match="x:note|aside">
  <xsl:call-template name="check-no-text-content"/>

  <div>
    <xsl:call-template name="attach-paragraph-number-as-id"/>
    <aside>
      <xsl:call-template name="copy-anchor"/>
      <xsl:apply-templates select="*"/>
    </aside>
  </div>
</xsl:template>

<xsl:template match="x:bcp14|bcp14">
  <!-- check valid BCP14 keywords, then emphasize them -->
  <xsl:variable name="c" select="normalize-space(translate(.,'&#160;',' '))"/>
  <xsl:choose>
    <xsl:when test="$c='MUST' or $c='REQUIRED' or $c='SHALL' or $c='MUST NOT'
      or $c='SHALL NOT' or $c='SHOULD' or $c='RECOMMENDED' or $c='SHOULD NOT'
      or $c='NOT RECOMMENDED' or $c='MAY' or $c='OPTIONAL'">
      <em class="bcp14"><xsl:value-of select="."/></em>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="."/>
      <xsl:call-template name="error">
        <xsl:with-param name="msg" select="concat('Unknown BCP14 keyword: ',$c)"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template match="x:blockquote|blockquote">
  <div>
    <xsl:call-template name="insertInsDelClass"/>
    <xsl:call-template name="editingMark" />
    <xsl:call-template name="attach-paragraph-number-as-id"/>
    <blockquote>
      <xsl:call-template name="copy-anchor"/>
      <xsl:copy-of select="@cite"/>
      <xsl:choose>
        <xsl:when test="t|ul|ol|dl|artwork|figure|sourcecode">
          <xsl:apply-templates/>
        </xsl:when>
        <xsl:otherwise>
          <p>
            <xsl:apply-templates/>
          </p>
        </xsl:otherwise>
      </xsl:choose>
      <xsl:if test="@quotedFrom">
        <cite>
          <xsl:text>&#8212; </xsl:text>
          <xsl:choose>
            <xsl:when test="@cite"><a href="{@cite}"><xsl:value-of select="@quotedFrom"/></a></xsl:when>
            <xsl:otherwise><xsl:value-of select="@quotedFrom"/></xsl:otherwise>
          </xsl:choose>
        </cite>
      </xsl:if>
    </blockquote>
  </div>
</xsl:template>

<!-- Definitions -->
<xsl:template match="x:dfn">
  <dfn>
    <xsl:call-template name="copy-anchor"/>
    <xsl:apply-templates/>
  </dfn>
</xsl:template>

<!-- headings -->
<xsl:template match="x:h">
  <b>
    <xsl:call-template name="copy-anchor"/>
    <xsl:apply-templates/>
  </b>
</xsl:template>

<!-- superscripts -->
<xsl:template match="x:sup|sup">
  <sup>
    <xsl:call-template name="copy-anchor"/>
    <xsl:apply-templates/>
  </sup>
</xsl:template>

<!-- subscripts -->
<xsl:template match="sub">
  <sub>
    <xsl:call-template name="copy-anchor"/>
    <xsl:apply-templates/>
  </sub>
</xsl:template>

<!-- bold -->
<xsl:template match="x:highlight">
  <b>
    <xsl:call-template name="copy-anchor"/>
    <xsl:apply-templates/>
  </b>
</xsl:template>

<!-- measuring lengths -->
<xsl:template match="x:length-of">
  <xsl:variable name="target" select="//*[@anchor=current()/@target]"/>
  <xsl:if test="count($target)!=1">
    <xsl:call-template name="error">
      <xsl:with-param name="msg" select="concat('@target ',@target,' defined ',count($target),' times.')"/>
    </xsl:call-template>
  </xsl:if>
  <xsl:variable name="content">
    <xsl:apply-templates select="$target"/>
  </xsl:variable>
  <xsl:variable name="lineends" select="string-length($content) - string-length(translate($content,'&#10;',''))"/>
  <xsl:variable name="indents">
    <xsl:choose>
      <xsl:when test="@indented">
        <xsl:value-of select="number(@indented) * $lineends"/>
      </xsl:when>
      <xsl:otherwise>0</xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <xsl:value-of select="string-length($content) + $lineends - $indents"/>
</xsl:template>

<!-- Almost Nop -->
<xsl:template match="x:span">
  <xsl:choose>
    <xsl:when test="@x:lang and $prettyprint-class!=''">
      <code class="{$prettyprint-class}">
        <xsl:call-template name="copy-anchor"/>
        <xsl:apply-templates/>
      </code>
    </xsl:when>
    <xsl:otherwise>
      <span>
        <xsl:call-template name="copy-anchor"/>
        <xsl:apply-templates/>
      </span>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template match="x:parse-xml">
  <xsl:apply-templates/>

  <xsl:if test="function-available('exslt:node-set')">
    <xsl:variable name="cleaned">
      <xsl:apply-templates mode="cleanup-edits"/>
    </xsl:variable>
    <xsl:if test="$xml2rfc-ext-trace-parse-xml='yes'">
      <xsl:call-template name="trace">
        <xsl:with-param name="msg" select="concat('Parsing XML: ', $cleaned)"/>
      </xsl:call-template>
    </xsl:if>
    <xsl:choose>
      <xsl:when test="function-available('myns:parseXml')" use-when="function-available('myns:parseXml')">
        <xsl:if test="myns:parseXml(concat($cleaned,''))!=''">
          <xsl:call-template name="error">
            <xsl:with-param name="msg" select="concat('Parse error in XML: ', myns:parseXml(concat($cleaned,'')))"/>
          </xsl:call-template>
        </xsl:if>
      </xsl:when>
      <xsl:when test="function-available('saxon:parse')" use-when="function-available('saxon:parse')">
        <xsl:variable name="parsed" select="saxon:parse(concat($cleaned,''))"/>
        <xsl:if test="$parsed='foo'">
          <xsl:comment>should not get here</xsl:comment>
        </xsl:if>
      </xsl:when>
      <xsl:when test="false()"></xsl:when>
      <xsl:otherwise></xsl:otherwise>
    </xsl:choose>
  </xsl:if>
</xsl:template>

<!-- inlined RDF support -->
<xsl:template match="rdf:Description">
  <!-- ignore -->
</xsl:template>

<!-- cleanup for ins/del -->

<xsl:template match="comment()|@*" mode="cleanup-edits"><xsl:copy/></xsl:template>

<xsl:template match="text()" mode="cleanup-edits"><xsl:copy/></xsl:template>

<xsl:template match="/" mode="cleanup-edits">
  <xsl:copy><xsl:apply-templates select="node()" mode="cleanup-edits" /></xsl:copy>
</xsl:template>

<xsl:template match="ed:del" mode="cleanup-edits"/>

<xsl:template match="ed:replace" mode="cleanup-edits">
  <xsl:apply-templates mode="cleanup-edits"/>
</xsl:template>

<xsl:template match="ed:ins" mode="cleanup-edits">
  <xsl:apply-templates mode="cleanup-edits"/>
</xsl:template>


<!-- ABNF support -->
<xsl:template name="to-abnf-char-sequence">
  <xsl:param name="chars"/>

  <xsl:variable name="asciistring">&#160; !"#$%&amp;'()*+,-./<xsl:value-of select="$digits"/>:;&lt;=>?@<xsl:value-of select="$ucase"/>[\]^_`<xsl:value-of select="$lcase"/>{|}~&#127;</xsl:variable> 
  <xsl:variable name="hex">0123456789ABCDEF</xsl:variable>
  
  <xsl:variable name="c" select="substring($chars,1,1)"/>
  <xsl:variable name="r" select="substring($chars,2)"/>
  <xsl:variable name="pos" select="string-length(substring-before($asciistring,$c))"/>
  
  <xsl:choose>
    <xsl:when test="$pos >= 1">
      <xsl:variable name="ascii" select="$pos + 31"/>
      <xsl:variable name="h" select="floor($ascii div 16)"/>
      <xsl:variable name="l" select="floor($ascii mod 16)"/>
      <xsl:value-of select="concat(substring($hex,1 + $h,1),substring($hex,1 + $l,1))"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:text>??</xsl:text>
      <xsl:call-template name="error">
        <xsl:with-param name="msg" select="concat('unexpected character in ABNF char sequence: ',substring($chars,1,1))" />
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>

  <xsl:if test="$r!=''">
    <xsl:text>.</xsl:text>
    <xsl:call-template name="to-abnf-char-sequence">
      <xsl:with-param name="chars" select="$r"/>
    </xsl:call-template>
  </xsl:if>

</xsl:template>

<xsl:template match="x:abnf-char-sequence">
  <xsl:choose>
    <xsl:when test="substring(.,1,1) != '&quot;' or substring(.,string-length(.),1) != '&quot;'">
      <xsl:call-template name="error">
        <xsl:with-param name="msg" select="'contents of x:abnf-char-sequence needs to be quoted.'" />
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:text>%x</xsl:text>
      <xsl:call-template name="to-abnf-char-sequence">
        <xsl:with-param name="chars" select="substring(.,2,string-length(.)-2)"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<!-- box drawing -->

<!-- nop for alignment -->
<xsl:template match="x:x"/>

<!-- box (top) -->
<xsl:template match="x:bt">
  <xsl:text>&#x250c;</xsl:text>
  <xsl:value-of select="translate(substring(.,2,string-length(.)-2),'-','&#x2500;')"/>
  <xsl:text>&#x2510;</xsl:text>
</xsl:template>

<!-- box (center) -->
<xsl:template match="x:bc">
  <xsl:variable name="first" select="substring(.,1)"/>
  <xsl:variable name="content" select="substring(.,2,string-length(.)-2)"/>
  <xsl:variable name="is-delimiter" select="translate($content,'-','')=''"/>

  <xsl:choose>
    <xsl:when test="$is-delimiter">
      <xsl:text>&#x251c;</xsl:text>
      <xsl:value-of select="translate($content,'-','&#x2500;')"/>
      <xsl:text>&#x2524;</xsl:text>
    </xsl:when>
    <xsl:when test="*">
      <xsl:for-each select="*|text()">
        <xsl:choose>
          <xsl:when test="position()=1">
            <xsl:text>&#x2502;</xsl:text>
            <xsl:value-of select="substring(.,2)"/>
          </xsl:when>
          <xsl:when test="position()=last()">
            <xsl:value-of select="substring(.,1,string-length(.)-1)"/>
            <xsl:text>&#x2502;</xsl:text>
          </xsl:when>
          <xsl:otherwise>
            <xsl:apply-templates select="."/>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:for-each>
    </xsl:when>
    <xsl:otherwise>
      <xsl:text>&#x2502;</xsl:text>
      <xsl:value-of select="$content"/>
      <xsl:text>&#x2502;</xsl:text>
    </xsl:otherwise>
  </xsl:choose>

</xsl:template>

<!-- box (bottom) -->
<xsl:template match="x:bb">
  <xsl:text>&#x2514;</xsl:text>
  <xsl:value-of select="translate(substring(.,2,string-length(.)-2),'-','&#x2500;')"/>
  <xsl:text>&#x2518;</xsl:text>
</xsl:template>

<!-- author handling extensions -->
<xsl:template match="x:include-author">
  <xsl:for-each select="/*/front/author[@anchor=current()/@target]">
    <xsl:apply-templates select="."/>
  </xsl:for-each>
</xsl:template>

<!-- boilerplate -->
<xsl:template match="boilerplate">
  <xsl:apply-templates/>
</xsl:template>

<!-- experimental annotation support -->

<xsl:template match="ed:issueref">
  <xsl:choose>
    <xsl:when test=".=//ed:issue/@name">
      <a href="#{$anchor-pref}issue.{.}">
        <xsl:apply-templates/>
      </a>
    </xsl:when>
    <xsl:when test="@href">
      <a href="{@href}" id="{$anchor-pref}issue.{.}">
        <xsl:apply-templates/>
      </a>
    </xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">Dangling ed:issueref: <xsl:value-of select="."/></xsl:with-param>
      </xsl:call-template>
      <xsl:apply-templates/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template match="ed:issue">
  <xsl:variable name="class">
    <xsl:choose>
      <xsl:when test="@status='closed'">closedissue</xsl:when>
      <xsl:otherwise>openissue</xsl:otherwise>
    </xsl:choose>
  </xsl:variable>

  <table class="{$class}">
    <tr>
      <td colspan="3">
        <a id="{$anchor-pref}issue.{@name}">
          <xsl:choose>
            <xsl:when test="@status='closed'">
              <xsl:attribute name="class">closed-issue</xsl:attribute>
            </xsl:when>
            <xsl:when test="@status='editor'">
              <xsl:attribute name="class">editor-issue</xsl:attribute>
            </xsl:when>
            <xsl:otherwise>
              <xsl:attribute name="class">open-issue</xsl:attribute>
            </xsl:otherwise>
          </xsl:choose>
          <xsl:text>&#160;I&#160;</xsl:text>
        </a>
        <xsl:text>&#160;</xsl:text>
        <xsl:choose>
          <xsl:when test="@href">
            <em><a href="{@href}"><xsl:value-of select="@name" /></a></em>
          </xsl:when>
          <xsl:when test="@alternate-href">
            <em>[<a href="{@alternate-href}">alternate link</a>]</em>
          </xsl:when>
          <xsl:otherwise>
            <em><xsl:value-of select="@name" /></em>
          </xsl:otherwise>
        </xsl:choose>
        &#0160;
        (type: <xsl:value-of select="@type"/>, status: <xsl:value-of select="@status"/>)
      </td>
    </tr>

    <xsl:apply-templates select="ed:item"/>
    <xsl:apply-templates select="ed:resolution"/>

    <xsl:variable name="changes" select="//*[@ed:resolves=current()/@name or ed:resolves=current()/@name]" />
    <xsl:if test="$changes">
      <tr>
        <td class="top" colspan="3">
          Associated changes in this document:
          <xsl:variable name="issue" select="@name"/>
          <xsl:for-each select="$changes">
            <a href="#{$anchor-pref}change.{$issue}.{position()}">
              <xsl:variable name="label">
                <xsl:call-template name="get-section-number"/>
              </xsl:variable>
              <xsl:choose>
                <xsl:when test="$label!=''"><xsl:value-of select="$label"/></xsl:when>
                <xsl:otherwise>&lt;<xsl:value-of select="concat('#',$anchor-pref,'change.',$issue,'.',position())"/>&gt;</xsl:otherwise>
              </xsl:choose>
            </a>
            <xsl:if test="position()!=last()">, </xsl:if>
          </xsl:for-each>
          <xsl:text>.</xsl:text>
        </td>
      </tr>
    </xsl:if>
  </table>

</xsl:template>

<xsl:template match="ed:item">
  <tr>
    <td class="top">
      <xsl:if test="@entered-by">
        <a href="mailto:{@entered-by}?subject={/rfc/@docName},%20{../@name}">
          <i><xsl:value-of select="@entered-by"/></i>
        </a>
      </xsl:if>
    </td>
    <td class="topnowrap">
      <xsl:value-of select="@date"/>
    </td>
    <td class="top">
      <xsl:apply-templates select="node()" mode="issuehtml"/>
    </td>
  </tr>
</xsl:template>

<xsl:template match="ed:resolution">
  <tr>
    <td class="top">
      <xsl:if test="@entered-by">
        <a href="mailto:{@entered-by}?subject={/rfc/@docName},%20{../@name}"><i><xsl:value-of select="@entered-by"/></i></a>
      </xsl:if>
    </td>
    <td class="topnowrap">
      <xsl:value-of select="@datetime"/>
    </td>
    <td class="top">
      <em>Resolution:</em>
      <xsl:apply-templates select="node()" mode="issuehtml"/>
    </td>
  </tr>
</xsl:template>

<xsl:template match="ed:annotation">
  <em>
    <xsl:apply-templates/>
  </em>
</xsl:template>

<!-- special templates for handling XHTML in issues -->
<xsl:template match="text()" mode="issuehtml">
  <xsl:value-of select="."/>
</xsl:template>

<xsl:template match="*|@*" mode="issuehtml">
  <xsl:message terminate="yes">Unexpected node in issue HTML: <xsl:value-of select="name(.)"/></xsl:message>
</xsl:template>

<xsl:template match="xhtml:a|xhtml:b|xhtml:br|xhtml:cite|xhtml:del|xhtml:em|xhtml:i|xhtml:ins|xhtml:q|xhtml:pre|xhtml:tt" mode="issuehtml">
  <xsl:element name="{local-name()}">
    <xsl:apply-templates select="@*|node()" mode="issuehtml"/>
  </xsl:element>
</xsl:template>

<xsl:template match="xhtml:p" mode="issuehtml">
  <xsl:apply-templates select="node()" mode="issuehtml"/>
  <br class="p"/>
</xsl:template>

<xsl:template match="xhtml:a/@href|xhtml:q/@cite" mode="issuehtml">
  <xsl:attribute name="{local-name(.)}">
    <xsl:value-of select="."/>
  </xsl:attribute>
</xsl:template>

<xsl:template match="ed:issueref" mode="issuehtml">
  <xsl:apply-templates select="."/>
</xsl:template>

<xsl:template match="ed:eref" mode="issuehtml">
  <xsl:text>&lt;</xsl:text>
  <a href="{.}"><xsl:value-of select="."/></a>
  <xsl:text>&gt;</xsl:text>
</xsl:template>

<xsl:template name="insertIssuesList">

  <h2 id="{$anchor-pref}issues-list" ><a href="#{$anchor-pref}issues-list">Issues list</a></h2>
  <table>
    <thead>
      <tr>
        <th>Id</th>
        <th>Type</th>
        <th>Status</th>
        <th>Date</th>
        <th>Raised By</th>
      </tr>
    </thead>
    <tbody>
      <xsl:for-each select="//ed:issue">
        <xsl:sort select="@status" />
        <xsl:sort select="@name" />
        <tr>
          <td><a href="#{$anchor-pref}issue.{@name}"><xsl:value-of select="@name" /></a></td>
          <td><xsl:value-of select="@type" /></td>
          <td><xsl:value-of select="@status" /></td>
          <td><xsl:value-of select="ed:item[1]/@date" /></td>
          <td><a href="mailto:{ed:item[1]/@entered-by}?subject={/rfc/@docName},%20{@name}"><xsl:value-of select="ed:item[1]/@entered-by" /></a></td>
        </tr>
      </xsl:for-each>
    </tbody>
  </table>

</xsl:template>

<xsl:template name="insert-diagnostics">

  <!-- check anchor names -->

  <xsl:variable name="badAnchors" select="//*[starts-with(@anchor,$anchor-pref)]" />
  <xsl:if test="$badAnchors">
    <xsl:variable name="text">
      <xsl:text>The following anchor names may collide with internally generated anchors because of their prefix "</xsl:text>
      <xsl:value-of select="$anchor-pref" />
      <xsl:text>": </xsl:text>
      <xsl:for-each select="$badAnchors">
        <xsl:value-of select="@anchor"/>
        <xsl:call-template name="lineno"/>
        <xsl:if test="position()!=last()">, </xsl:if>
      </xsl:for-each>
    </xsl:variable>
    <xsl:call-template name="warning">
      <xsl:with-param name="msg"><xsl:value-of select="normalize-space($text)"/></xsl:with-param>
      <xsl:with-param name="lineno" select="false()"/>
    </xsl:call-template>
  </xsl:if>

  <xsl:variable name="badV3Anchors" select="//*[substring(@anchor,2,1)='-' and translate(substring(@anchor,1,1),$lcase,'')='']" />
  <xsl:if test="$badV3Anchors">
    <xsl:variable name="text">
      <xsl:text>The following anchor names may collide with internally generated anchors in XML2RFCV3 mode because: </xsl:text>
      <xsl:for-each select="$badV3Anchors">
        <xsl:value-of select="@anchor"/>
        <xsl:call-template name="lineno"/>
        <xsl:if test="position()!=last()">, </xsl:if>
      </xsl:for-each>
    </xsl:variable>
    <xsl:call-template name="warning">
      <xsl:with-param name="msg"><xsl:value-of select="normalize-space($text)"/></xsl:with-param>
      <xsl:with-param name="lineno" select="false()"/>
    </xsl:call-template>
  </xsl:if>

  <xsl:variable name="all-refs" select="/rfc/back/references/reference|exslt:node-set($includeDirectives)//reference|exslt:node-set($sourcedReferences)//reference"/>

  <!-- check ABNF syntax references -->
  <xsl:if test="//artwork[@type='abnf2616' or @type='abnf7230']|//sourcecode[@type='abnf2616' or type='abnf7320']">
    <xsl:if test="not($all-refs//seriesInfo[@name='RFC' and (@value='2068' or @value='2616' or @value='7230')]) and not($all-refs//seriesInfo[@name='Internet-Draft' and (starts-with(@value, 'draft-ietf-httpbis-p1-messaging-') or starts-with(@value, 'draft-ietf-httpbis-semantics-'))])">
      <!-- check for draft-ietf-httpbis-p1-messaging- is for backwards compat -->
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">document uses HTTP-style ABNF syntax, but doesn't reference RFC 2068, RFC 2616, or RFC 7230.</xsl:with-param>
      </xsl:call-template>
    </xsl:if>
  </xsl:if>
  <xsl:if test="//artwork[@type='abnf']|//sourcecode[@type='abnf']">
    <xsl:if test="not($all-refs//seriesInfo[@name='RFC' and (@value='2234' or @value='4234' or @value='5234')])">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">document uses ABNF syntax, but doesn't reference RFC 2234, 4234 or 5234.</xsl:with-param>
      </xsl:call-template>
    </xsl:if>
  </xsl:if>

  <!-- check IDs -->
  <xsl:variable name="badTargets" select="//xref[not(ancestor::toc)][not(@target=//@anchor) and not(@target=exslt:node-set($includeDirectives)//@anchor) and not(ancestor::ed:del)]" />
  <xsl:if test="$badTargets">
    <xsl:variable name="text">
      <xsl:text>The following target names do not exist: </xsl:text>
      <xsl:for-each select="$badTargets">
        <xsl:value-of select="@target"/>
        <xsl:if test="not(@target)">(@target attribute missing)</xsl:if>
        <xsl:call-template name="lineno"/>
        <xsl:if test="position()!=last()">
          <xsl:text>, </xsl:text>
        </xsl:if>
      </xsl:for-each>
    </xsl:variable>
    <xsl:call-template name="warning">
      <xsl:with-param name="msg"><xsl:value-of select="$text"/></xsl:with-param>
    </xsl:call-template>
  </xsl:if>


</xsl:template>

<!-- special change mark support, not supported by RFC2629 yet -->

<xsl:template match="@ed:*" />

<xsl:template match="ed:del">
  <xsl:call-template name="insert-issue-pointer"/>
  <del>
    <xsl:copy-of select="@*[namespace-uri()='']"/>
    <xsl:if test="not(@title) and ancestor-or-self::*[@ed:entered-by] and @datetime">
      <xsl:attribute name="title"><xsl:value-of select="concat(@datetime,', ',ancestor-or-self::*[@ed:entered-by][1]/@ed:entered-by)"/></xsl:attribute>
    </xsl:if>
    <xsl:apply-templates />
  </del>
</xsl:template>

<xsl:template match="ed:ins">
  <xsl:call-template name="insert-issue-pointer"/>
  <ins>
    <xsl:copy-of select="@*[namespace-uri()='']"/>
    <xsl:if test="not(@title) and ancestor-or-self::*[@ed:entered-by] and @datetime">
      <xsl:attribute name="title"><xsl:value-of select="concat(@datetime,', ',ancestor-or-self::*[@ed:entered-by][1]/@ed:entered-by)"/></xsl:attribute>
    </xsl:if>
    <xsl:apply-templates />
  </ins>
</xsl:template>

<xsl:template name="insert-issue-pointer">
  <xsl:param name="deleted-anchor"/>
  <xsl:variable name="change" select="."/>
  <xsl:for-each select="@ed:resolves|ed:resolves">
    <xsl:variable name="resolves" select="."/>
    <!-- need the right context node for proper numbering -->
    <xsl:variable name="count"><xsl:for-each select=".."><xsl:number level="any" count="*[@ed:resolves=$resolves or ed:resolves=$resolves]" /></xsl:for-each></xsl:variable>
    <xsl:variable name="total" select="count(//*[@ed:resolves=$resolves or ed:resolves=$resolves])" />
    <xsl:variable name="id">
      <xsl:value-of select="$anchor-pref"/>change.<xsl:value-of select="$resolves"/>.<xsl:value-of select="$count" />
    </xsl:variable>
    <xsl:choose>
      <!-- block level? -->
      <xsl:when test="not(ancestor::t) and not(ancestor::title) and not(ancestor::figure) and not($change/@ed:old-title)">
        <div class="issuepointer {$css-noprint}">
          <xsl:if test="not($deleted-anchor)">
            <xsl:attribute name="id"><xsl:value-of select="$id"/></xsl:attribute>
          </xsl:if>
          <xsl:if test="$count > 1">
            <a class="bg-issue" title="previous change for {$resolves}" href="#{$anchor-pref}change.{$resolves}.{$count - 1}">&#x2191;</a>
          </xsl:if>
          <a class="open-issue" href="#{$anchor-pref}issue.{$resolves}" title="resolves: {$resolves}">
            <xsl:choose>
              <xsl:when test="//ed:issue[@name=$resolves and @status='closed']">
                <xsl:attribute name="class">closed-issue</xsl:attribute>
              </xsl:when>
              <xsl:when test="//ed:issue[@name=$resolves and @status='editor']">
                <xsl:attribute name="class">editor-issue</xsl:attribute>
              </xsl:when>
              <xsl:otherwise>
                <xsl:attribute name="class">open-issue</xsl:attribute>
              </xsl:otherwise>
            </xsl:choose>
            <xsl:text>&#160;I&#160;</xsl:text>
          </a>
          <xsl:if test="$count &lt; $total">
            <a class="bg-issue" title="next change for {$resolves}" href="#{$anchor-pref}change.{$resolves}.{$count + 1}">&#x2193;</a>
          </xsl:if>
          <xsl:text>&#160;</xsl:text>
        </div>
      </xsl:when>
      <xsl:otherwise>
        <xsl:if test="$count > 1">
          <a class="bg-issue" title="previous change for {$resolves}" href="#{$anchor-pref}change.{$resolves}.{$count - 1}">&#x2191;</a>
        </xsl:if>
        <a title="resolves: {$resolves}" href="#{$anchor-pref}issue.{$resolves}">
          <xsl:if test="not($deleted-anchor)">
            <xsl:attribute name="id"><xsl:value-of select="$id"/></xsl:attribute>
          </xsl:if>
          <xsl:choose>
            <xsl:when test="//ed:issue[@name=$resolves and @status='closed']">
              <xsl:attribute name="class">closed-issue <xsl:value-of select="$css-noprint"/></xsl:attribute>
            </xsl:when>
            <xsl:when test="//ed:issue[@name=$resolves and @status='editor']">
              <xsl:attribute name="class">editor-issue <xsl:value-of select="$css-noprint"/></xsl:attribute>
            </xsl:when>
            <xsl:otherwise>
              <xsl:attribute name="class">open-issue <xsl:value-of select="$css-noprint"/></xsl:attribute>
            </xsl:otherwise>
          </xsl:choose>
          <xsl:text>&#160;I&#160;</xsl:text>
        </a>
        <xsl:if test="$count &lt; $total">
          <a class="bg-issue" title="next change for {$resolves}" href="#{$anchor-pref}change.{$resolves}.{$count + 1}">&#x2193;</a>
        </xsl:if>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:for-each>
</xsl:template>

<xsl:template match="ed:replace">
  <!-- we need to special-case things like lists and tables -->
  <xsl:choose>
    <xsl:when test="parent::list">
      <xsl:apply-templates select="ed:del/node()" />
      <xsl:apply-templates select="ed:ins/node()" />
    </xsl:when>
    <xsl:when test="parent::references">
      <xsl:apply-templates select="ed:del/node()" />
      <xsl:apply-templates select="ed:ins/node()" />
    </xsl:when>
    <xsl:otherwise>
      <xsl:if test="@cite">
        <a class="editor-issue" href="{@cite}" target="_blank" title="see {@cite}">
          <xsl:text>&#160;i&#160;</xsl:text>
        </a>
      </xsl:if>
      <xsl:call-template name="insert-issue-pointer"/>
      <xsl:if test="ed:del">
        <del>
          <xsl:copy-of select="@*[namespace-uri()='']"/>
          <xsl:if test="not(@title) and ancestor-or-self::xsl:template[@ed:entered-by] and @datetime">
            <xsl:attribute name="title"><xsl:value-of select="concat(@datetime,', ',ancestor-or-self::*[@ed:entered-by][1]/@ed:entered-by)"/></xsl:attribute>
          </xsl:if>
          <xsl:apply-templates select="ed:del/node()" />
        </del>
      </xsl:if>
      <xsl:if test="ed:ins">
        <ins>
          <xsl:copy-of select="@*[namespace-uri()='']"/>
          <xsl:if test="not(@title) and ancestor-or-self::*[@ed:entered-by] and @datetime">
            <xsl:attribute name="title"><xsl:value-of select="concat(@datetime,', ',ancestor-or-self::*[@ed:entered-by][1]/@ed:entered-by)"/></xsl:attribute>
          </xsl:if>
          <xsl:apply-templates select="ed:ins/node()" />
        </ins>
      </xsl:if>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<!-- convenience template for helping Mozilla (pre/ins inheritance problem) -->
<xsl:template name="insertInsDelClass">
  <xsl:if test="ancestor::ed:del">
    <xsl:attribute name="class">del</xsl:attribute>
  </xsl:if>
  <xsl:if test="ancestor::ed:ins">
    <xsl:attribute name="class">ins</xsl:attribute>
  </xsl:if>
</xsl:template>


<xsl:template name="sectionnumberAndEdits">
  <xsl:choose>
    <xsl:when test="ancestor::ed:del">
      <xsl:text>del-</xsl:text>
      <xsl:number count="ed:del//section" level="any"/>
    </xsl:when>
    <xsl:when test="@x:fixed-section-number and @x:fixed-section-number!=''">
      <xsl:value-of select="@x:fixed-section-number"/>
    </xsl:when>
    <xsl:when test="(@x:fixed-section-number and @x:fixed-section-number='') or @numbered='false'">
      <xsl:value-of select="$unnumbered"/>
      <xsl:number count="section[@x:fixed-section-number='' or @numbered='false']" level="any"/>
    </xsl:when>
    <xsl:when test="self::section and parent::ed:ins and local-name(../..)='replace'">
      <xsl:for-each select="../.."><xsl:call-template name="sectionnumberAndEdits" /></xsl:for-each>
      <xsl:for-each select="..">
        <xsl:if test="parent::ed:replace">
          <xsl:for-each select="..">
            <xsl:if test="parent::section">.</xsl:if>
            <xsl:variable name="cnt" select="1+count(preceding-sibling::section|preceding-sibling::ed:ins/section|preceding-sibling::ed:replace/ed:ins/section)" />
            <xsl:choose>
              <xsl:when test="ancestor::back and not(ancestor::section)"><xsl:number format="A" value="$cnt"/></xsl:when>
              <xsl:otherwise><xsl:value-of select="$cnt"/></xsl:otherwise>
            </xsl:choose>
          </xsl:for-each>
        </xsl:if>
      </xsl:for-each>
    </xsl:when>
    <xsl:when test="self::section[parent::ed:ins]">
      <xsl:for-each select="../.."><xsl:call-template name="sectionnumberAndEdits" /></xsl:for-each>
      <xsl:for-each select="..">
        <xsl:if test="parent::section">.</xsl:if><xsl:value-of select="1+count(preceding-sibling::section|preceding-sibling::ed:ins/section|preceding-sibling::ed:replace/ed:ins/section)" />
      </xsl:for-each>
    </xsl:when>
    <xsl:when test="self::section">
      <xsl:for-each select=".."><xsl:call-template name="sectionnumberAndEdits" /></xsl:for-each>
      <xsl:if test="parent::section">.</xsl:if>
      <xsl:choose>
        <xsl:when test="parent::back">
          <xsl:number format="A" value="1+count(preceding-sibling::section|preceding-sibling::ed:ins/section|preceding-sibling::ed:replace/ed:ins/section)" />
        </xsl:when>
        <xsl:otherwise>
          <xsl:number value="1+count(preceding-sibling::section|preceding-sibling::ed:ins/section|preceding-sibling::ed:replace/ed:ins/section)" />
        </xsl:otherwise>
      </xsl:choose>
    </xsl:when>
    <xsl:when test="self::references">
      <xsl:choose>
        <xsl:when test="count(/*/back/references)+count(/*/back/ed:replace/ed:ins/references)=1"><xsl:call-template name="get-references-section-number"/></xsl:when>
        <xsl:otherwise><xsl:call-template name="get-references-section-number"/>.<xsl:number level="any"/></xsl:otherwise>
      </xsl:choose>
    </xsl:when>
    <xsl:when test="self::middle or self::back"><!-- done --></xsl:when>
    <xsl:otherwise>
      <!-- go up one level -->
      <xsl:for-each select=".."><xsl:call-template name="sectionnumberAndEdits" /></xsl:for-each>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<!-- utilities for warnings -->

<xsl:template name="trace">
  <xsl:param name="msg"/>
  <xsl:param name="msg2"/>
  <xsl:param name="inline" select="'no'"/>
  <xsl:param name="lineno" select="true()"/>
  <xsl:call-template name="emit-message">
    <xsl:with-param name="level">TRACE</xsl:with-param>
    <xsl:with-param name="msg" select="$msg"/>
    <xsl:with-param name="msg2" select="$msg2"/>
    <xsl:with-param name="inline" select="$inline"/>
    <xsl:with-param name="lineno" select="$lineno"/>
  </xsl:call-template>
</xsl:template>

<xsl:template name="inline-warning">
  <xsl:param name="msg"/>
  <xsl:param name="msg2"/>
  <xsl:param name="lineno" select="true()"/>
  <xsl:call-template name="emit-message">
    <xsl:with-param name="level">WARNING</xsl:with-param>
    <xsl:with-param name="dlevel">3</xsl:with-param>
    <xsl:with-param name="msg" select="$msg"/>
    <xsl:with-param name="msg2" select="$msg2"/>
    <xsl:with-param name="inline" select="'yes'"/>
    <xsl:with-param name="lineno" select="$lineno"/>
  </xsl:call-template>
</xsl:template>

<xsl:template name="warning">
  <xsl:param name="msg"/>
  <xsl:param name="msg2"/>
  <xsl:param name="lineno" select="true()"/>
  <xsl:call-template name="emit-message">
    <xsl:with-param name="level">WARNING</xsl:with-param>
    <xsl:with-param name="dlevel">3</xsl:with-param>
    <xsl:with-param name="msg" select="$msg"/>
    <xsl:with-param name="msg2" select="$msg2"/>
    <xsl:with-param name="inline" select="'no'"/>
    <xsl:with-param name="lineno" select="$lineno"/>
  </xsl:call-template>
</xsl:template>

<xsl:template name="info">
  <xsl:param name="msg"/>
  <xsl:param name="msg2"/>
  <xsl:param name="lineno" select="true()"/>
  <xsl:call-template name="emit-message">
    <xsl:with-param name="level">INFO</xsl:with-param>
    <xsl:with-param name="dlevel">2</xsl:with-param>
    <xsl:with-param name="msg" select="$msg"/>
    <xsl:with-param name="msg2" select="$msg2"/>
    <xsl:with-param name="inline" select="'no'"/>
    <xsl:with-param name="lineno" select="$lineno"/>
  </xsl:call-template>
</xsl:template>

<xsl:template name="error">
  <xsl:param name="msg"/>
  <xsl:param name="msg2"/>
  <xsl:param name="inline"/>
  <xsl:param name="lineno" select="true()"/>
  <xsl:call-template name="emit-message">
    <xsl:with-param name="level">ERROR</xsl:with-param>
    <xsl:with-param name="dlevel">4</xsl:with-param>
    <xsl:with-param name="msg" select="$msg"/>
    <xsl:with-param name="msg2" select="$msg2"/>
    <xsl:with-param name="inline" select="$inline"/>
    <xsl:with-param name="lineno" select="$lineno"/>
  </xsl:call-template>
</xsl:template>

<xsl:template name="emit-message-inline">
  <xsl:param name="message"/>
  <xsl:choose>
    <xsl:when test="ancestor::t or ancestor-or-self::seriesInfo">
      <span class="{$css-error}"><xsl:value-of select="$message"/></span>
    </xsl:when>
    <xsl:otherwise>
      <div class="{$css-error}"><xsl:value-of select="$message"/></div>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="emit-message">
  <xsl:param name="level">DEBUG</xsl:param>
  <xsl:param name="dlevel">0</xsl:param>
  <xsl:param name="msg"/>
  <xsl:param name="msg2"/>
  <xsl:param name="inline"/>
  <xsl:param name="lineno" select="true()"/>
  <xsl:if test="$dlevel >= $log-level">
    <xsl:variable name="message"><xsl:value-of select="$level"/>: <xsl:value-of select="$msg"/><xsl:if test="$msg2!=''"> - <xsl:value-of select="$msg2"/></xsl:if><xsl:if test="$lineno"><xsl:call-template name="lineno"/></xsl:if></xsl:variable>
    <xsl:choose>
      <xsl:when test="$inline!='no'">
        <xsl:call-template name="emit-message-inline">
          <xsl:with-param name="message" select="$message"/>
        </xsl:call-template>
      </xsl:when>
      <xsl:otherwise>
        <!-- this fails when the message contains characters not encodable in the output encoding -->
        <!-- <xsl:comment><xsl:value-of select="$message"/></xsl:comment> -->
      </xsl:otherwise>
    </xsl:choose>
    <xsl:choose>
      <xsl:when test="$dlevel >= $abort-log-level">
        <xsl:message terminate="yes"><xsl:value-of select="$message"/></xsl:message>
      </xsl:when>
      <xsl:otherwise>
        <xsl:message><xsl:value-of select="$message"/></xsl:message>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:if>
</xsl:template>

<!-- table formatting -->

<xsl:template match="table">
  <div class="{$css-tt}">
    <xsl:call-template name="copy-anchor"/>
    <xsl:apply-templates select="iref"/>
    <xsl:variable name="style">
      <xsl:text>v3 </xsl:text>
      <xsl:choose>
        <xsl:when test="@align='left'"><xsl:value-of select="$css-tleft"/></xsl:when>
        <xsl:when test="@align='right'"><xsl:value-of select="$css-tright"/></xsl:when>
        <xsl:when test="@align='center' or not(@align) or @align=''"><xsl:value-of select="$css-tcenter"/></xsl:when>
        <xsl:otherwise/>
      </xsl:choose>
    </xsl:variable>

    <table class="{$style}">
      <xsl:variable name="n"><xsl:call-template name="get-table-number"/></xsl:variable>
      <caption>
        <xsl:text>Table </xsl:text>
        <xsl:value-of select="$n"/>
        <xsl:if test="name">
          <xsl:text>: </xsl:text>
          <xsl:apply-templates select="name/node()"/>
        </xsl:if>
      </caption>
      <xsl:apply-templates select="*[not(self::iref)]"/>
    </table>
  </div>
</xsl:template>

<xsl:template match="table/name"/>

<xsl:template match="tbody">
  <tbody>
    <xsl:call-template name="copy-anchor"/>
    <xsl:apply-templates select="*"/>
  </tbody>
</xsl:template>

<xsl:template match="tfoot">
  <tfoot>
    <xsl:call-template name="copy-anchor"/>
    <xsl:apply-templates select="*"/>
  </tfoot>
</xsl:template>

<xsl:template match="thead">
  <thead>
    <xsl:call-template name="copy-anchor"/>
    <xsl:apply-templates select="*"/>
  </thead>
</xsl:template>

<xsl:template match="tr">
  <tr>
    <xsl:call-template name="copy-anchor"/>
    <xsl:apply-templates select="*"/>
  </tr>
</xsl:template>

<xsl:template name="t-alignment">
  <xsl:attribute name="class">
    <xsl:choose>
      <xsl:when test="@align='left' or not(@align) or @align=''"><xsl:value-of select="$css-left"/></xsl:when>
      <xsl:when test="@align='right'"><xsl:value-of select="$css-right"/></xsl:when>
      <xsl:when test="@align='center'"><xsl:value-of select="$css-center"/></xsl:when>
      <xsl:otherwise>
        <xsl:call-template name="warning">
          <xsl:with-param name="msg">Unknown align attribute: <xsl:value-of select="@align"/></xsl:with-param>
        </xsl:call-template>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:attribute>
</xsl:template>

<xsl:template match="td">
  <td>
    <xsl:call-template name="copy-anchor"/>
    <xsl:call-template name="t-alignment"/>
    <xsl:copy-of select="@colspan|@rowspan"/>
    <xsl:apply-templates select="node()"/>
  </td>
</xsl:template>

<xsl:template match="th">
  <th>
    <xsl:call-template name="copy-anchor"/>
    <xsl:call-template name="t-alignment"/>
    <xsl:copy-of select="@colspan|@rowspan"/>
    <xsl:apply-templates select="node()"/>
  </th>
</xsl:template>

<xsl:template match="texttable">
  <xsl:call-template name="check-no-text-content"/>

  <xsl:variable name="anch">
    <xsl:call-template name="get-table-anchor"/>
  </xsl:variable>

  <div id="{$anch}" class="{$css-tt}">

    <xsl:if test="@anchor!=''">
      <div id="{@anchor}"/>
    </xsl:if>
    <xsl:apply-templates select="preamble" />

    <xsl:variable name="style">
      <xsl:value-of select="$css-tt"/>
      <xsl:text> </xsl:text>
      <xsl:choose>
        <xsl:when test="@style!=''">
          <xsl:value-of select="@style"/>
        </xsl:when>
        <xsl:otherwise>full</xsl:otherwise>
      </xsl:choose>
      <xsl:choose>
        <xsl:when test="@align='left'"><xsl:text> </xsl:text><xsl:value-of select="$css-tleft"/></xsl:when>
        <xsl:when test="@align='right'"><xsl:text> </xsl:text><xsl:value-of select="$css-tright"/></xsl:when>
        <xsl:when test="@align='center' or not(@align) or @align=''"><xsl:text> </xsl:text><xsl:value-of select="$css-tcenter"/></xsl:when>
        <xsl:otherwise/>
      </xsl:choose>
    </xsl:variable>

    <table class="{$style}">
      <xsl:if test="(@title!='') or (@anchor!='' and not(@suppress-title='true'))">
        <xsl:variable name="n"><xsl:call-template name="get-table-number"/></xsl:variable>
        <caption>
          <xsl:if test="@x:caption-side='top'">
            <xsl:attribute name="class">caption-top</xsl:attribute>
          </xsl:if>
          <xsl:if test="not(starts-with($n,'u'))">
            <xsl:text>Table </xsl:text>
            <xsl:value-of select="$n"/>
            <xsl:if test="@title!=''">: </xsl:if>
          </xsl:if>
          <xsl:if test="@title!=''">
            <xsl:value-of select="@title" />
          </xsl:if>
        </caption>
      </xsl:if>

      <xsl:if test="ttcol!=''">
        <!-- skip header when all column titles are empty -->
        <thead>
          <tr>
            <xsl:apply-templates select="ttcol" />
          </tr>
        </thead>
      </xsl:if>
      <tbody>
        <xsl:variable name="columns" select="count(ttcol)" />
        <xsl:variable name="fields" select="c | ed:replace/ed:ins/c | ed:replace/ed:del/c" />
        <xsl:for-each select="$fields[$columns=1 or (position() mod $columns) = 1]">
          <tr>
            <xsl:for-each select=". | following-sibling::c[position() &lt; $columns]">
              <td>
                <xsl:call-template name="copy-anchor"/>
                <xsl:call-template name="insertInsDelClass"/>
                <xsl:variable name="pos" select="position()" />
                <xsl:variable name="col" select="../ttcol[position() = $pos]" />
                <xsl:choose>
                  <xsl:when test="$col/@align='right' or $col/@align='center'">
                    <xsl:attribute name="class"><xsl:value-of select="$col/@align"/></xsl:attribute>
                  </xsl:when>
                  <xsl:when test="$col/@align='left' or not($col/@align)">
                    <xsl:attribute name="class"><xsl:value-of select="$css-left"/></xsl:attribute>
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:call-template name="warning">
                      <xsl:with-param name="msg">Unknown align attribute on ttcol: <xsl:value-of select="$col/@align"/></xsl:with-param>
                    </xsl:call-template>
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:apply-templates select="node()" />
              </td>
            </xsl:for-each>
          </tr>
        </xsl:for-each>
      </tbody>
    </table>
    <xsl:apply-templates select="postamble" />
  </div>

</xsl:template>

<xsl:template match="ttcol">
  <th>

    <xsl:choose>
      <xsl:when test="@align='right' or @align='center' or @align='left'">
        <xsl:attribute name="class"><xsl:value-of select="@align"/></xsl:attribute>
      </xsl:when>
      <xsl:when test="not(@align)">
        <!-- that's the default, nothing to do here -->
      </xsl:when>
      <xsl:otherwise>
        <xsl:message>Unknown align attribute on ttcol: <xsl:value-of select="@align"/></xsl:message>
      </xsl:otherwise>
    </xsl:choose>

    <xsl:if test="@width">
      <xsl:attribute name="style">width: <xsl:value-of select="@width" />;</xsl:attribute>
    </xsl:if>

    <xsl:apply-templates />
  </th>
</xsl:template>

<!-- cref support -->

<xsl:template name="get-comment-name">
  <xsl:choose>
    <xsl:when test="@anchor">
      <xsl:value-of select="@anchor"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="$anchor-pref"/>
      <xsl:text>comment.</xsl:text>
      <xsl:number count="cref[not(@anchor)]" level="any"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template match="cref[@display='false']">
  <!-- hidden -->
</xsl:template>

<xsl:template match="cref[not(@display) or @display!='false']">
  <xsl:if test="$xml2rfc-comments!='no'">
    <xsl:variable name="cid">
      <xsl:call-template name="get-comment-name"/>
    </xsl:variable>

    <span class="comment">
      <xsl:choose>
        <xsl:when test="$xml2rfc-inline='yes'">
          <xsl:attribute name="id">
            <xsl:value-of select="$cid"/>
          </xsl:attribute>
          <xsl:text>[</xsl:text>
          <xsl:if test="@anchor or (not(/rfc/@version) or /rfc/@version &lt; 3)">
            <a href="#{$cid}" class="smpl">
              <xsl:value-of select="$cid"/>
            </a>
            <xsl:text>: </xsl:text>
          </xsl:if>
          <xsl:apply-templates select="text()|eref|xref"/>
          <xsl:if test="@source"> --<xsl:value-of select="@source"/></xsl:if>
          <xsl:text>]</xsl:text>
        </xsl:when>
        <xsl:otherwise>
          <xsl:attribute name="title">
            <xsl:if test="@source"><xsl:value-of select="@source"/>: </xsl:if>
            <xsl:variable name="content">
              <xsl:apply-templates select="text()|eref|xref"/>
            </xsl:variable>
            <xsl:value-of select="$content"/>
          </xsl:attribute>
          <xsl:text>[</xsl:text>
          <a href="#{$cid}">
            <xsl:value-of select="$cid"/>
          </a>
          <xsl:text>]</xsl:text>
        </xsl:otherwise>
      </xsl:choose>
    </span>
  </xsl:if>
</xsl:template>

<xsl:template name="insertComments">

  <xsl:call-template name="insert-conditional-hrule"/>

  <h2>
    <xsl:call-template name="insert-conditional-pagebreak"/>
    <a id="{$anchor-pref}comments" href="#{$anchor-pref}comments">Editorial Comments</a>
  </h2>

  <dl>
    <xsl:for-each select="//cref[not(@display) or @display!='false']">
      <xsl:variable name="cid">
        <xsl:choose>
          <xsl:when test="@anchor">
            <xsl:value-of select="@anchor"/>
          </xsl:when>
          <xsl:otherwise>
            <xsl:value-of select="$anchor-pref"/>
            <xsl:text>comment.</xsl:text>
            <xsl:number count="cref[not(@anchor)]" level="any"/>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:variable>
      <dt id="{$cid}">
        [<xsl:value-of select="$cid"/>]
      </dt>
      <dd>
        <xsl:apply-templates select="node()"/>
        <xsl:if test="@source"> --<xsl:value-of select="@source"/></xsl:if>
      </dd>
    </xsl:for-each>
  </dl>
</xsl:template>


<!-- Chapter Link Generation -->

<xsl:template match="*" mode="links"><xsl:apply-templates mode="links"/></xsl:template>
<xsl:template match="text()" mode="links" />

<xsl:template match="/*/middle//section[not(ancestor::section)]" mode="links">
  <xsl:variable name="sectionNumber"><xsl:call-template name="get-section-number" /></xsl:variable>
  <xsl:variable name="title">
    <xsl:if test="$sectionNumber!='' and not(contains($sectionNumber,$unnumbered))">
      <xsl:value-of select="$sectionNumber"/>
      <xsl:text> </xsl:text>
    </xsl:if>
    <xsl:choose>
      <xsl:when test="name">
        <xsl:variable name="hold">
          <xsl:apply-templates select="name/node()"/>
        </xsl:variable>
        <xsl:value-of select="normalize-space($hold)"/>
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="@title"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <link rel="Chapter" title="{$title}" href="#{$anchor-pref}section.{$sectionNumber}"/>
  <xsl:apply-templates mode="links" />
</xsl:template>

<xsl:template match="/*/back//section[not(ancestor::section)]" mode="links">
  <xsl:variable name="sectionNumber"><xsl:call-template name="get-section-number" /></xsl:variable>
  <xsl:variable name="title">
    <xsl:if test="$sectionNumber!='' and not(contains($sectionNumber,$unnumbered))">
      <xsl:value-of select="$sectionNumber"/>
      <xsl:text> </xsl:text>
    </xsl:if>
    <xsl:choose>
      <xsl:when test="name">
        <xsl:variable name="hold">
          <xsl:apply-templates select="name/node()"/>
        </xsl:variable>
        <xsl:value-of select="normalize-space($hold)"/>
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="@title"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <link rel="Appendix" title="{$title}" href="#{$anchor-pref}section.{$sectionNumber}"/>
  <xsl:apply-templates mode="links" />
</xsl:template>

<xsl:template match="/*/back/references[position()=1]" mode="links">
  <xsl:variable name="sectionNumber"><xsl:call-template name="get-references-section-number" /></xsl:variable>
  <xsl:variable name="title">
    <xsl:choose>
      <xsl:when test="@title and count(/*/back/references)=1">
        <xsl:call-template name="get-references-section-number"/>
        <xsl:text> </xsl:text>
        <xsl:value-of select="@title"/>
      </xsl:when>
      <xsl:otherwise>
        <xsl:call-template name="get-references-section-number"/>
        <xsl:text> </xsl:text>
        <xsl:value-of select="$xml2rfc-refparent"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <link rel="Chapter" title="{$title}" href="#{$anchor-pref}section.{$sectionNumber}"/>
</xsl:template>

<!-- convenience templates -->

<xsl:template name="get-author-summary">
  <xsl:choose>
    <xsl:when test="count(/rfc/front/author)=1">
      <xsl:value-of select="/rfc/front/author[1]/@surname" />
    </xsl:when>
    <xsl:when test="count(/rfc/front/author)=2">
      <xsl:value-of select="concat(/rfc/front/author[1]/@surname,' &amp; ',/rfc/front/author[2]/@surname)" />
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="concat(/rfc/front/author[1]/@surname,', et al.')" />
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="get-bottom-center">
  <xsl:choose>
    <xsl:when test="/rfc/@docName">
      <!-- for IDs, use the expiry date -->
      <xsl:text>Expires </xsl:text><xsl:call-template name="expirydate" />
    </xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="get-category-long"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="get-category-long">
  <xsl:choose>
    <xsl:when test="$xml2rfc-footer!=''"><xsl:value-of select="$xml2rfc-footer" /></xsl:when>
    <xsl:when test="$xml2rfc-private!=''"/> <!-- private draft, footer not set -->
    <xsl:when test="/rfc/@category='bcp'">Best Current Practice</xsl:when>
    <xsl:when test="/rfc/@category='historic'">Historic</xsl:when>
    <xsl:when test="/rfc/@category='info' or not(/rfc/@category)">Informational</xsl:when>
    <xsl:when test="/rfc/@category='std'">Standards Track</xsl:when>
    <xsl:when test="/rfc/@category='exp'">Experimental</xsl:when>
    <xsl:otherwise>(category unknown)</xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="get-header-center">
  <xsl:choose>
    <xsl:when test="string-length(/rfc/front/title/@abbrev) &gt; 0">
      <xsl:value-of select="/rfc/front/title/@abbrev" />
    </xsl:when>
    <xsl:otherwise>
      <xsl:apply-templates select="/rfc/front/title" mode="get-text-content" />
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="get-header-left">
  <xsl:choose>
    <xsl:when test="$xml2rfc-header!=''"><xsl:value-of select="$xml2rfc-header" /></xsl:when>
    <xsl:when test="$xml2rfc-private!=''"/> <!-- private draft, header not set -->
    <xsl:when test="/rfc/@ipr and not($is-rfc)">Internet-Draft</xsl:when>
    <xsl:otherwise>RFC <xsl:value-of select="$rfcno"/></xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="get-generator">
  <xsl:variable name="gen">
    <xsl:text>http://greenbytes.de/tech/webdav/rfc2629.xslt, </xsl:text>
    <!-- when RCS keyword substitution in place, add version info -->
    <xsl:if test="contains('$Revision: 1.1328 $',':')">
      <xsl:value-of select="concat('Revision ',normalize-space(translate(substring-after('$Revision: 1.1328 $', 'Revision: '),'$','')),', ')" />
    </xsl:if>
    <xsl:if test="contains('$Date: 2020/09/24 11:34:24 $',':')">
      <xsl:value-of select="concat(normalize-space(translate(substring-after('$Date: 2020/09/24 11:34:24 $', 'Date: '),'$','')),', ')" />
    </xsl:if>
    <xsl:variable name="product" select="normalize-space(concat(system-property('xsl:product-name'),' ',system-property('xsl:product-version')))"/>
    <xsl:if test="$product!=''">
      <xsl:value-of select="concat('XSLT processor: ',$product,', ')"/>
    </xsl:if>
    <xsl:value-of select="concat('XSLT vendor: ',system-property('xsl:vendor'),' ',system-property('xsl:vendor-url'))" />
  </xsl:variable>
  <xsl:variable name="via">
    <xsl:variable name="c1" select="/comment()[starts-with(normalize-space(.),'generated by ')]"/>
    <xsl:variable name="mmark-lookup">name="GENERATOR" content=</xsl:variable>
    <xsl:variable name="c2" select="/comment()[starts-with(normalize-space(.),$mmark-lookup)]"/>
    <xsl:choose>
      <xsl:when test="$c1">
        <xsl:value-of select="substring-after(normalize-space($c1),'generated by ')"/>
      </xsl:when>
      <xsl:when test="$c2">
        <xsl:variable name="remove">"</xsl:variable>
        <xsl:value-of select="translate(substring-after(normalize-space($c2),$mmark-lookup),$remove,'')"/>
      </xsl:when>
      <xsl:otherwise/>
    </xsl:choose>
  </xsl:variable>
  <xsl:value-of select="$gen" />
  <xsl:if test="$via!=''">
    <xsl:text>, via: </xsl:text>
    <xsl:value-of select="$via"/>
  </xsl:if>
</xsl:template>

<xsl:template name="get-header-right">
  <xsl:if test="$xml2rfc-ext-pub-day!='' and /rfc/front/date/@x:include-day='true' and $is-rfc">
    <xsl:value-of select="number($xml2rfc-ext-pub-day)" />
    <xsl:text> </xsl:text>
  </xsl:if>
  <xsl:value-of select="concat($xml2rfc-ext-pub-month, ' ', $xml2rfc-ext-pub-year)" />
</xsl:template>

<xsl:template name="get-keywords">
  <xsl:for-each select="/rfc/front/keyword">
    <xsl:if test="contains(.,',')">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">keyword element appears to contain a comma-separated list, split into multiple elements instead.</xsl:with-param>
      </xsl:call-template>
    </xsl:if>
    <xsl:value-of select="normalize-space(.)" />
    <xsl:if test="position()!=last()">, </xsl:if>
  </xsl:for-each>
</xsl:template>

<!-- get language from context node. nearest ancestor or return the default of "en" -->
<xsl:template name="get-lang">
  <xsl:choose>
    <xsl:when test="ancestor-or-self::*[@xml:lang]"><xsl:value-of select="ancestor-or-self::*/@xml:lang" /></xsl:when>
    <xsl:otherwise>en</xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="get-section-number">
  <xsl:variable name="anchor" select="@anchor"/>
  <xsl:choose>
    <xsl:when test="self::note">
      <xsl:number count="note"/>
    </xsl:when>
    <xsl:when test="@x:fixed-section-number and @x:fixed-section-number!=''">
      <xsl:value-of select="@x:fixed-section-number"/>
    </xsl:when>
    <xsl:when test="(@x:fixed-section-number and @x:fixed-section-number='') or ancestor-or-self::*/@numbered='false'">
      <xsl:value-of select="$unnumbered"/>
      <xsl:number count="section[@x:fixed-section-number='' or ancestor-or-self::*/@numbered='false']" level="any"/>
      <!-- checks -->
      <xsl:if test="@numbered='false'">
        <xsl:if test="ancestor::section or ancestor::section">
          <xsl:call-template name="error">
            <xsl:with-param name="inline" select="'no'"/>
            <xsl:with-param name="msg">Only top-level sections can be unnumbered</xsl:with-param>
          </xsl:call-template>
        </xsl:if>
        <xsl:if test="following-sibling::section[not(@numbered) or @numbered!='false']">
          <xsl:call-template name="error">
            <xsl:with-param name="inline" select="'no'"/>
            <xsl:with-param name="msg">Unnumbered section is followed by numbered sections</xsl:with-param>
          </xsl:call-template>
        </xsl:if>
        <xsl:if test="ancestor::middle and ../../back/references">
          <xsl:call-template name="error">
            <xsl:with-param name="inline" select="'no'"/>
            <xsl:with-param name="msg">Unnumbered section is followed by (numbered) references section</xsl:with-param>
          </xsl:call-template>
        </xsl:if>
      </xsl:if>
    </xsl:when>
    <xsl:when test="$has-edits or ancestor::*/@x:fixed-section-number">
      <xsl:call-template name="sectionnumberAndEdits" />
    </xsl:when>
    <xsl:otherwise>
      <xsl:choose>
        <xsl:when test="self::references and not(parent::references)">
          <xsl:choose>
            <xsl:when test="count(/*/back/references)=1">
              <xsl:call-template name="get-references-section-number"/>
            </xsl:when>
            <xsl:otherwise>
              <xsl:call-template name="get-references-section-number"/>.<xsl:number count="references"/>
            </xsl:otherwise>
          </xsl:choose>
        </xsl:when>
        <xsl:when test="self::references and parent::references">
          <xsl:for-each select=".."><xsl:call-template name="get-section-number"/></xsl:for-each>.<xsl:number count="references"/>
        </xsl:when>
        <xsl:when test="self::reference">
          <xsl:for-each select="parent::references">
            <xsl:choose>
              <xsl:when test="count(/*/back/references)=1">
                <xsl:call-template name="get-references-section-number"/>
              </xsl:when>
              <xsl:otherwise>
                <xsl:call-template name="get-references-section-number"/>.<xsl:number count="references"/>
              </xsl:otherwise>
            </xsl:choose>
          </xsl:for-each>
        </xsl:when>
        <xsl:when test="ancestor::reference">
          <xsl:for-each select="ancestor::reference">
            <xsl:call-template name="get-section-number"/>
          </xsl:for-each>
        </xsl:when>
        <xsl:when test="ancestor::back"><xsl:number count="section|appendix" level="multiple" format="A.1.1.1.1.1.1.1" /></xsl:when>
        <xsl:when test="self::appendix"><xsl:number count="appendix" level="multiple" format="A.1.1.1.1.1.1.1" /></xsl:when>
        <xsl:otherwise><xsl:number count="section" level="multiple"/></xsl:otherwise>
      </xsl:choose>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<!-- get the section number for the references section -->
<xsl:template name="get-references-section-number">
  <xsl:value-of select="count(/rfc/middle/section[not(@numbered) or @numbered!='false']) + count(/rfc/middle/ed:replace/ed:ins/section[not(@numbered) or @numbered!='false']) + 1"/>
</xsl:template>

<xsl:template name="emit-section-number">
  <xsl:param name="no"/>
  <xsl:param name="appendixPrefix" select="false()"/>
  <xsl:if test="$appendixPrefix and translate($no,$ucase,'')=''">Appendix </xsl:if>
  <xsl:value-of select="$no"/><xsl:if test="not(contains($no,'.')) or $xml2rfc-ext-sec-no-trailing-dots!='no'">.</xsl:if>
</xsl:template>

<xsl:template name="get-section-type">
  <xsl:choose>
    <xsl:when test="self::abstract">Abstract</xsl:when>
    <xsl:when test="self::note">Note</xsl:when>
    <xsl:when test="ancestor::back and not(self::references)">Appendix</xsl:when>
    <xsl:otherwise>Section</xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="get-table-number">
  <xsl:choose>
    <xsl:when test="self::table or @anchor!=''">
      <xsl:number level="any" count="texttable[@anchor!='']|table" />
    </xsl:when>
    <xsl:otherwise>
      <xsl:text>u.</xsl:text>
      <xsl:number level="any" count="texttable[not(@anchor) or @anchor='']" />
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="get-table-anchor">
  <xsl:value-of select="$anchor-pref"/>
  <xsl:text>table.</xsl:text>
  <xsl:call-template name="get-table-number"/>
</xsl:template>

<xsl:template name="get-figure-number">
  <xsl:choose>
    <xsl:when test="@anchor!='' or @title or name">
      <xsl:number level="any" count="figure[@anchor!='' or @title or name]" />
    </xsl:when>
    <xsl:otherwise>
      <xsl:text>u.</xsl:text>
      <xsl:number level="any" count="figure[(not(@anchor) or @anchor='') and not(@title) and not(name)]" />
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="get-figure-anchor">
  <xsl:value-of select="$anchor-pref"/>
  <xsl:text>figure.</xsl:text>
  <xsl:call-template name="get-figure-number"/>
</xsl:template>

<!-- reformat contents of author/@initials -->
<xsl:template name="format-initials">
  <xsl:param name="initials" select="@initials"/>

  <xsl:variable name="computed-initials">
    <xsl:choose>
      <xsl:when test="normalize-space($initials)!=''">
        <xsl:value-of select="$initials"/>
      </xsl:when>
      <xsl:otherwise>
        <xsl:call-template name="get-author-initials"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
 
  <xsl:variable name="normalized" select="normalize-space($computed-initials)"/>

  <xsl:choose>
    <xsl:when test="$normalized=''">
      <!-- nothing to do -->
    </xsl:when>
    <xsl:otherwise>
      <xsl:variable name="r">
        <xsl:call-template name="t-format-initials">
          <xsl:with-param name="remainder" select="$normalized"/>
        </xsl:call-template>
      </xsl:variable>
    
      <xsl:if test="$r!=@initials">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg">@initials '<xsl:value-of select="@initials"/>': did you mean '<xsl:value-of select="$r"/>'?</xsl:with-param>
        </xsl:call-template>
      </xsl:if>
    
      <xsl:value-of select="$r"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="t-format-initials">
  <xsl:param name="have"/>
  <xsl:param name="remainder"/>

  <xsl:variable name="first" select="substring($remainder,1,1)"/>
  <xsl:variable name="prev" select="substring($have,string-length($have))"/>

<!--<xsl:message>
have: <xsl:value-of select="$have"/>
remainder: <xsl:value-of select="$remainder"/>
first: <xsl:value-of select="$first"/>
prev: <xsl:value-of select="$prev"/>
</xsl:message>-->

  <xsl:choose>
    <xsl:when test="$remainder='' and $prev!='.'">
      <xsl:value-of select="concat($have,'.')"/>
    </xsl:when>
    <xsl:when test="$remainder=''">
      <xsl:value-of select="$have"/>
    </xsl:when>
    <xsl:when test="$prev='.' and $first='.'">
      <!-- repeating dots -->
      <xsl:call-template name="t-format-initials">
        <xsl:with-param name="have" select="$have"/>
        <xsl:with-param name="remainder" select="substring($remainder,2)"/>
      </xsl:call-template>
    </xsl:when>
    <!-- missing dot before '-' -->
<!--    <xsl:when test="$prev!='.' and $first='-'">
      <xsl:call-template name="t-format-initials">
        <xsl:with-param name="have" select="concat($have,'.-')"/>
        <xsl:with-param name="remainder" select="substring($remainder,2)"/>
      </xsl:call-template>
    </xsl:when>-->
    <!-- missing space after '.' -->
<!--    <xsl:when test="$prev='.' and $first!=' '">
      <xsl:call-template name="t-format-initials">
        <xsl:with-param name="have" select="concat($have,' ',$first)"/>
        <xsl:with-param name="remainder" select="substring($remainder,2)"/>
      </xsl:call-template>
    </xsl:when>-->
    <xsl:otherwise>
      <xsl:call-template name="t-format-initials">
        <xsl:with-param name="have" select="concat($have,$first)"/>
        <xsl:with-param name="remainder" select="substring($remainder,2)"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>

</xsl:template>

<xsl:template name="truncate-initials">
  <xsl:param name="initials"/>
  <xsl:variable name="local-multiple-initials">
    <xsl:call-template name="parse-pis">
      <xsl:with-param name="nodes" select="../../processing-instruction('rfc')|../processing-instruction('rfc')|./processing-instruction('rfc')"/>
      <xsl:with-param name="attr" select="'multiple-initials'"/>
    </xsl:call-template>
  </xsl:variable>
  <xsl:variable name="use-multiple-initials">
    <xsl:choose>
      <xsl:when test="$local-multiple-initials!=''">
        <xsl:value-of select="$local-multiple-initials"/>
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="$xml2rfc-multiple-initials"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <xsl:choose>
    <xsl:when test="normalize-space($initials)=''"/>
    <xsl:when test="$use-multiple-initials='yes'">
      <xsl:value-of select="$initials"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="concat(substring-before($initials,'.'),'.')"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<!-- see https://chromium-i18n.appspot.com/ssl-address -->
<countries xmlns="mailto:julian.reschke@greenbytes.de?subject=rfc2629.xslt">
  <c c2="AR" c3="ARG" sn="Argentina" fmt="%A%n%Z %C%n%S"/>
  <c c2="AU" c3="AUS" sn="Australia" fmt="%A%n%C %S %Z"/>
  <c c2="AT" c3="AUT" sn="Austria" fmt="%A%n%Z %C"/>
  <c c2="BE" c3="BEL" sn="Belgium" fmt="%A%n%Z %C"/>
  <c c2="BR" c3="BRA" sn="Brazil" fmt="%A%n%D%n%C-%S%n%Z"/>
  <c c2="CA" c3="CAN" sn="Canada" fmt="%A%n%C %S %Z"/>
  <c c2="CL" c3="CHL" sn="Chile" fmt="%A%n%Z %C%n%S"/>
  <c c2="CN" c3="CHN" sn="China" fmt="%Z%n%S%C%D%n%A"/>
  <c c2="HR" c3="HRV" sn="Croatia" fmt="%A%n%Z %C" postprefix="HR-"/>
  <c c2="CZ" c3="CZE" sn="Czechia" fmt="%A%n%Z %C"/>
  <c c2="DK" c3="DNK" sn="Denmark" fmt="%A%n%Z %C"/>
  <c c2="DE" c3="DEU" sn="Germany" fmt="%A%n%Z %C"/>
  <c c2="GR" c3="GRC" sn="Greece" fmt="%A%n%Z %C"/>
  <c c2="FI" c3="FIN" sn="Finland" fmt="%A%n%Z %C" postprefix="FI-"/>/>
  <c c2="FR" c3="FRA" sn="France" fmt="%A%n%Z %C"/>
  <c c2="HU" c3="HUN" sn="Hungary" fmt="%C%n%A%n%Z"/>
  <c c2="IN" c3="IND" sn="India" fmt="%A%n%C %Z%n%S"/>
  <c c2="IR" c3="IRL" sn="Ireland" fmt="%A%n%D%n%C%n%S %Z"/>
  <c c2="IL" c3="ISR" sn="Israel" fmt="%A%n%C %Z"/>
  <c c2="IT" c3="ITA" sn="Italy" fmt="%A%n%Z %C %S"/>
  <c c2="JP" c3="JPN" sn="Japan" fmt="%Z%n%S%n%A" postprefix="&#12306;"/>
  <c c2="KR" c3="KOR" sn="Korea (the Republic of)" fmt="%A%n%C, %S %Z"/>
  <c c2="LU" c3="LUX" sn="Luxembourg" fmt="%A%n%Z %C" postprefix="L-"/>
  <c c2="MU" c3="MUS" sn="Mauritius" fmt="%A%n%Z%n%C"/>
  <c c2="MX" c3="MEX" sn="Mexico" fmt="%A%n%D%n%Z %C, %S"/>
  <c c2="NL" c3="NLD" sn="Netherlands" fmt="%A%n%Z %C"/>
  <c c2="NZ" c3="NZL" sn="New Zealand" fmt="%A%n%D%n%C %Z"/>
  <c c2="NO" c3="NOR" sn="Norway" fmt="%A%n%Z %C"/>
  <c c2="PL" c3="POL" sn="Poland" fmt="%A%n%Z %C"/>
  <c c2="PT" c3="PRT" sn="Portugal" fmt="%A%n%Z %C"/>
  <c c2="RO" c3="ROU" sn="Romania" fmt="%A%n%Z %C"/>
  <c c2="RU" c3="RUS" sn="Russian Federation" fmt="%A%n%C%n%S%n%Z"/>
  <c c2="SG" c3="SGP" sn="Singapore" fmt="%A%n%Z" postprefix="SINGAPORE "/>
  <c c2="SK" c3="SVK" sn="Slovakia" fmt="%A%n%Z %C"/>
  <c c2="SI" c3="SVN" sn="Slovenia" fmt="%A%n%Z %C" postprefix="SI-"/>
  <c c2="ES" c3="ESP" sn="Spain" fmt="%A%n%Z %C %S"/>
  <c c2="SE" c3="SWE" sn="Sweden" fmt="%A%n%Z %C" postprefix="SE-"/>
  <c c2="CH" c3="CHE" sn="Switzerland" fmt="%A%n%Z %C" postprefix="CH-"/>
  <c c2="TH" c3="THA" sn="Thailand" fmt="%A%n%D %C%n%S %Z"/>
  <c c2="TR" c3="TUR" sn="Turkey" fmt="%A%n%Z %C/%S"/>
  <c c2="GB" c3="GBR" sn="United Kingdom of Great Britain and Northern Ireland" alias1="UK" fmt="%A%n%C%n%Z"/>
  <c c2="US" c3="USA" sn="United States of America" fmt="%A%n%C, %S %Z"/>
  <c c2="UY" c3="URY" sn="Uruguay" fmt="%A%n%Z %C %S"/>
</countries>

<xsl:template name="get-country-format">
  <xsl:param name="country"/>
  <xsl:variable name="countries" select="document('')/*/myns:countries/myns:c"/>

  <xsl:variable name="short" select="translate(normalize-space(translate($country,'.','')),$lcase,$ucase)"/>

  <xsl:choose>
    <xsl:when test="$countries[@sn=$country]">
      <!-- all good -->
      <xsl:value-of select="$countries[@sn=$country]/@fmt"/>
    </xsl:when>
    <xsl:when test="$short=''">
      <!-- already warned -->
    </xsl:when>
    <xsl:when test="not($countries/@sn=$country) and ($countries/@c3=$short)">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">'<xsl:value-of select="$country"/>' is not an ISO country short name, maybe you meant '<xsl:value-of select="$countries[@c3=$short]/@sn"/>'?</xsl:with-param>
      </xsl:call-template>
    </xsl:when>
    <xsl:when test="not($countries/@sn=$country) and ($countries/@c2=$short)">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">'<xsl:value-of select="$country"/>' is not an ISO country short name, maybe you meant '<xsl:value-of select="$countries[@c2=$short]/@sn"/>'?</xsl:with-param>
      </xsl:call-template>
    </xsl:when>
    <xsl:when test="not($countries/@sn=$country) and ($countries/@alias1=$short)">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">'<xsl:value-of select="$country"/>' is not an ISO country short name, maybe you meant '<xsl:value-of select="$countries[@alias1=$short]/@sn"/>'?</xsl:with-param>
      </xsl:call-template>
    </xsl:when>
    <xsl:when test="$countries[starts-with(translate(@sn,$lcase,$ucase),$short)]">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">'<xsl:value-of select="$country"/>' is not an ISO country short name, maybe you meant '<xsl:value-of select="$countries[starts-with(translate(@sn,$lcase,$ucase),$short)][1]/@sn"/>'? (lookup of short names: https://www.iso.org/obp/ui/)</xsl:with-param>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">ISO country short name '<xsl:value-of select="$country"/>' unknown (lookup of short names: https://www.iso.org/obp/ui/)</xsl:with-param>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="get-country-postprefix">
  <xsl:param name="country"/>
  <xsl:variable name="countries" select="document('')/*/myns:countries/myns:c"/>
  <xsl:value-of select="$countries[@sn=$country]/@postprefix"/>
</xsl:template>

<xsl:template name="extract-normalized">
  <xsl:param name="node" select="."/>
  <xsl:param name="ascii" select="false()"/>

  <xsl:variable name="name" select="local-name($node)"/>

  <xsl:variable name="n">
    <xsl:choose>
      <xsl:when test="$ascii and $node/@ascii!=''">
        <xsl:value-of select="$node/@ascii"/>
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="$node"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  
  <xsl:variable name="text" select="normalize-space($n)"/>
  <xsl:if test="string-length($n) != string-length($text)">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">excessive whitespace in <xsl:value-of select="$name"/>: '<xsl:value-of select="$n"/>'</xsl:with-param>
    </xsl:call-template>
  </xsl:if>

  <xsl:if test="$text=''">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">missing text in <xsl:value-of select="$name"/></xsl:with-param>
    </xsl:call-template>
  </xsl:if>
  
  <xsl:value-of select="$text"/>
</xsl:template>

<!-- checking for email element -->
<xsl:template name="extract-email">
  <xsl:variable name="email" select="normalize-space(.)"/>
  <xsl:if test="contains($email,' ')">
    <xsl:call-template name="error">
      <xsl:with-param name="msg">whitespace in email address: '<xsl:value-of select="."/>'</xsl:with-param>
    </xsl:call-template>
  </xsl:if>

  <xsl:variable name="email2">
    <xsl:choose>
      <xsl:when test="starts-with($email,'mailto:')">
        <xsl:call-template name="warning">
          <xsl:with-param name="msg">email should not include URI scheme: '<xsl:value-of select="."/>'</xsl:with-param>
        </xsl:call-template>
        <xsl:value-of select="substring($email, 1 + string-length('mailto:'))"/>
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="$email"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <xsl:value-of select="$email2"/>
</xsl:template>

<!-- checking for uri element -->
<xsl:template name="extract-uri">
  <xsl:variable name="uri" select="normalize-space(.)"/>
  <xsl:if test="string-length(.) != string-length($uri) or contains($uri,' ')">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">excessive whitespace in URI: '<xsl:value-of select="."/>'</xsl:with-param>
    </xsl:call-template>
  </xsl:if>
  <xsl:if test="$uri=''">
    <xsl:call-template name="warning">
      <xsl:with-param name="msg">URI is empty</xsl:with-param>
    </xsl:call-template>
  </xsl:if>

  <xsl:value-of select="$uri"/>
</xsl:template>

<xsl:template name="insert-conditional-pagebreak">
  <xsl:if test="$xml2rfc-compact!='yes'">
    <xsl:attribute name="class">np</xsl:attribute>
  </xsl:if>
</xsl:template>

<xsl:template name="insert-conditional-hrule">
  <xsl:if test="$xml2rfc-compact!='yes'">
    <hr class="{$css-noprint}" />
  </xsl:if>
</xsl:template>

<!-- get text content from marked-up text -->

<xsl:template match="text()" mode="get-text-content">
  <xsl:value-of select="normalize-space(.)"/>
</xsl:template>

<xsl:template match="br" mode="get-text-content">
  <xsl:text> </xsl:text>
</xsl:template>

<xsl:template match="*" mode="get-text-content">
  <xsl:apply-templates mode="get-text-content"/>
</xsl:template>

<xsl:template match="ed:del" mode="get-text-content">
</xsl:template>

<!-- parsing of processing instructions -->
<xsl:template name="parse-pis">
  <xsl:param name="nodes"/>
  <xsl:param name="attr"/>
  <xsl:param name="sep"/>
  <xsl:param name="ret"/>
  <xsl:param name="default"/>
  <xsl:param name="duplicate-warning" select="'yes'"/>

  <xsl:choose>
    <xsl:when test="count($nodes)=0">
      <xsl:choose>
        <xsl:when test="$ret!=''">
          <xsl:value-of select="$ret"/>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="$default"/>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:when>
    <xsl:otherwise>
      <xsl:variable name="ret2">
        <xsl:for-each select="$nodes[1]">
          <xsl:call-template name="parse-one-pi">
            <xsl:with-param name="str" select="."/>
            <xsl:with-param name="attr" select="$attr"/>
            <xsl:with-param name="sep" select="$sep"/>
            <xsl:with-param name="ret" select="$ret"/>
            <xsl:with-param name="duplicate-warning" select="$duplicate-warning"/>
          </xsl:call-template>
        </xsl:for-each>
      </xsl:variable>

      <xsl:call-template name="parse-pis">
        <xsl:with-param name="nodes" select="$nodes[position()!=1]"/>
        <xsl:with-param name="attr" select="$attr"/>
        <xsl:with-param name="sep" select="$sep"/>
        <xsl:with-param name="ret" select="$ret2"/>
        <xsl:with-param name="default" select="$default"/>
        <xsl:with-param name="duplicate-warning" select="$duplicate-warning"/>
      </xsl:call-template>

    </xsl:otherwise>
  </xsl:choose>

</xsl:template>

<xsl:template name="parse-one-pi">
  <xsl:param name="str"/>
  <xsl:param name="attr"/>
  <xsl:param name="sep"/>
  <xsl:param name="ret"/>
  <xsl:param name="duplicate-warning"/>

  <xsl:variable name="str2">
    <xsl:call-template name="eat-leading-whitespace">
      <xsl:with-param name="str" select="$str"/>
    </xsl:call-template>
  </xsl:variable>

  <xsl:choose>
    <xsl:when test="$str2=''">
      <!-- done -->
      <xsl:value-of select="$ret"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:variable name="attrname" select="substring-before($str2,'=')"/>

      <xsl:choose>
        <xsl:when test="$attrname=''">
          <xsl:call-template name="warning">
            <xsl:with-param name="msg">bad PI syntax: <xsl:value-of select="$str2"/></xsl:with-param>
          </xsl:call-template>
          <xsl:value-of select="$ret"/>
        </xsl:when>
        <xsl:otherwise>
          <xsl:variable name="remainder" select="substring($str2,2+string-length($attrname))"/>
          <xsl:choose>
            <xsl:when test="string-length($remainder) &lt; 2">
              <xsl:call-template name="warning">
                <xsl:with-param name="msg">bad PI value syntax: <xsl:value-of select="$remainder"/></xsl:with-param>
              </xsl:call-template>
              <xsl:value-of select="$ret"/>
            </xsl:when>
            <xsl:otherwise>
              <xsl:variable name="rem">
                <xsl:call-template name="eat-leading-whitespace">
                  <xsl:with-param name="str" select="$remainder"/>
                </xsl:call-template>
              </xsl:variable>
              <xsl:variable name="qchars">&apos;&quot;</xsl:variable>
              <xsl:variable name="qchar" select="substring($rem,1,1)"/>
              <xsl:variable name="rem2" select="substring($rem,2)"/>
              <xsl:choose>
                <xsl:when test="not(contains($qchars,$qchar))">
                  <xsl:call-template name="warning">
                    <xsl:with-param name="msg">pseudo-attribute value needs to be quoted: <xsl:value-of select="$rem"/></xsl:with-param>
                  </xsl:call-template>
                  <xsl:value-of select="$ret"/>
                </xsl:when>
                <xsl:when test="not(contains($rem2,$qchar))">
                  <xsl:call-template name="warning">
                    <xsl:with-param name="msg">unmatched quote in: <xsl:value-of select="$rem2"/></xsl:with-param>
                  </xsl:call-template>
                  <xsl:value-of select="$ret"/>
                </xsl:when>
                <xsl:otherwise>
                  <xsl:variable name="value" select="substring-before($rem2,$qchar)"/>

                  <!-- check pseudo-attribute names -->
                  <xsl:if test="name()='rfc-ext' and $attr='SANITYCHECK'">
                    <xsl:choose>
                      <xsl:when test="$attrname='abort-on'"/>
                      <xsl:when test="$attrname='allow-markup-in-artwork'"/>
                      <xsl:when test="$attrname='authors-section'"/>
                      <xsl:when test="$attrname='check-artwork-width'"/>
                      <xsl:when test="$attrname='css-contents'"/>
                      <xsl:when test="$attrname='css-resource'"/>
                      <xsl:when test="$attrname='duplex'"/>
                      <xsl:when test="$attrname='html-pretty-print'"/>
                      <xsl:when test="$attrname='include-index'"/>
                      <xsl:when test="$attrname='include-references-in-index'"/>
                      <xsl:when test="$attrname='internet-draft-uri'"/>
                      <xsl:when test="$attrname='justification'"/>
                      <xsl:when test="$attrname='log-level'"/>
                      <xsl:when test="$attrname='paragraph-links'"/>
                      <xsl:when test="$attrname='parse-xml-in-artwork'"/>
                      <xsl:when test="$attrname='refresh-from'"/>
                      <xsl:when test="$attrname='refresh-interval'"/>
                      <xsl:when test="$attrname='refresh-xslt'"/>
                      <xsl:when test="$attrname='rfc-uri'"/>
                      <xsl:when test="$attrname='sec-no-trailing-dots'"/>
                      <xsl:when test="$attrname='trace-parse-xml'"/>
                      <xsl:when test="$attrname='ucd-file'"/>
                      <xsl:when test="$attrname='use-system-time'"/>
                      <xsl:when test="$attrname='vspace-pagebreak'"/>
                      <xsl:when test="$attrname='xml2rfc-backend'"/>
                      <xsl:when test="$attrname='xref-with-text-generate'"/>
                      <xsl:otherwise>
                        <xsl:call-template name="warning">
                          <xsl:with-param name="msg">unsupported rfc-ext pseudo-attribute '<xsl:value-of select="$attrname"/>'</xsl:with-param>
                        </xsl:call-template>
                      </xsl:otherwise>
                    </xsl:choose>
                  </xsl:if>

                  <xsl:if test="name()='rfc' and $attr='SANITYCHECK'">
                    <xsl:choose>
                      <xsl:when test="$attrname='authorship'"/>
                      <xsl:when test="$attrname='comments'"/>
                      <xsl:when test="$attrname='compact'"/>
                      <xsl:when test="$attrname='docmapping'">
                        <xsl:if test="$value!='yes'">
                          <xsl:call-template name="warning">
                            <xsl:with-param name="msg">the rfc docmapping pseudo-attribute with values other than 'yes' in not supported by this processor.</xsl:with-param>
                          </xsl:call-template>
                        </xsl:if>
                      </xsl:when>
                      <xsl:when test="$attrname='editing'"/>
                      <xsl:when test="$attrname='footer'"/>
                      <xsl:when test="$attrname='header'"/>
                      <xsl:when test="$attrname='include'">
                        <xsl:choose>
                          <xsl:when test="not(parent::references)">
                            <xsl:call-template name="error">
                              <xsl:with-param name="msg">the rfc include pseudo-attribute (unless a child node of &lt;references&gt;) is not supported by this processor, see http://greenbytes.de/tech/webdav/rfc2629xslt/rfc2629xslt.html#examples.internalsubset for alternative syntax.</xsl:with-param>
                            </xsl:call-template>
                          </xsl:when>
                          <xsl:otherwise>
                            <xsl:call-template name="warning">
                              <xsl:with-param name="msg">the rfc include pseudo-attribute is only partially supported by this processor, see http://greenbytes.de/tech/webdav/rfc2629xslt/rfc2629xslt.html#examples.internalsubset for alternative syntax.</xsl:with-param>
                            </xsl:call-template>
                          </xsl:otherwise>
                        </xsl:choose>
                      </xsl:when>
                      <xsl:when test="$attrname='inline'"/>
                      <xsl:when test="$attrname='iprnotified'"/>
                      <xsl:when test="$attrname='linefile'"/>
                      <xsl:when test="$attrname='linkmailto'"/>
                      <xsl:when test="$attrname='multiple-initials'"/>
                      <xsl:when test="$attrname='private'"/>
                      <xsl:when test="$attrname='rfcedstyle'"/>
                      <xsl:when test="$attrname='sortrefs'"/>
                      <xsl:when test="$attrname='subcompact'"/>
                      <xsl:when test="$attrname='strict'"/>
                      <xsl:when test="$attrname='symrefs'"/>
                      <xsl:when test="$attrname='toc'"/>
                      <xsl:when test="$attrname='tocdepth'"/>
                      <xsl:when test="$attrname='tocindent'">
                        <xsl:if test="$value!='yes'">
                          <xsl:call-template name="warning">
                            <xsl:with-param name="msg">the rfc tocindent pseudo-attribute with values other than 'yes' in not supported by this processor.</xsl:with-param>
                          </xsl:call-template>
                        </xsl:if>
                      </xsl:when>
                      <xsl:otherwise>
                        <xsl:call-template name="info">
                          <xsl:with-param name="msg">unsupported rfc pseudo-attribute '<xsl:value-of select="$attrname"/>'</xsl:with-param>
                        </xsl:call-template>
                      </xsl:otherwise>
                    </xsl:choose>
                  </xsl:if>

                  <xsl:choose>
                    <xsl:when test="$attrname != $attr">
                      <!-- pseudo-attr does not match, continue -->
                      <xsl:call-template name="parse-one-pi">
                        <xsl:with-param name="str" select="substring($rem2, 2 + string-length($value))"/>
                        <xsl:with-param name="attr" select="$attr"/>
                        <xsl:with-param name="sep" select="$sep"/>
                        <xsl:with-param name="ret" select="$ret"/>
                        <xsl:with-param name="duplicate-warning" select="$duplicate-warning"/>
                      </xsl:call-template>
                    </xsl:when>
                    <xsl:when test="$sep='' and $ret!=''">
                      <!-- pseudo-attr does match, but we only want one value -->
                      <xsl:if test="$ret != $value and $duplicate-warning='yes'">
                        <xsl:call-template name="warning">
                          <xsl:with-param name="msg">duplicate pseudo-attribute <xsl:value-of select="$attr"/>, overwriting value <xsl:value-of select="$ret"/></xsl:with-param>
                        </xsl:call-template>
                      </xsl:if>
                      <xsl:call-template name="parse-one-pi">
                        <xsl:with-param name="str" select="substring($rem2, 2 + string-length($value))"/>
                        <xsl:with-param name="attr" select="$attr"/>
                        <xsl:with-param name="sep" select="$sep"/>
                        <xsl:with-param name="ret" select="$value"/>
                        <xsl:with-param name="duplicate-warning" select="$duplicate-warning"/>
                      </xsl:call-template>
                    </xsl:when>
                    <xsl:otherwise>
                      <!-- pseudo-attr does match -->
                      <xsl:call-template name="parse-one-pi">
                        <xsl:with-param name="str" select="substring($rem2, 2 + string-length($value))"/>
                        <xsl:with-param name="attr" select="$attr"/>
                        <xsl:with-param name="sep" select="$sep"/>
                        <xsl:with-param name="duplicate-warning" select="$duplicate-warning"/>
                        <xsl:with-param name="ret">
                          <xsl:choose>
                            <xsl:when test="$ret!=''">
                              <xsl:value-of select="concat($ret,$sep,$value)"/>
                            </xsl:when>
                            <xsl:otherwise>
                              <xsl:value-of select="$value"/>
                            </xsl:otherwise>
                          </xsl:choose>
                        </xsl:with-param>
                      </xsl:call-template>
                    </xsl:otherwise>

                  </xsl:choose>

                </xsl:otherwise>
              </xsl:choose>
            </xsl:otherwise>
          </xsl:choose>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:otherwise>
  </xsl:choose>

</xsl:template>

<xsl:template name="eat-leading-whitespace">
  <xsl:param name="str"/>

  <xsl:choose>
    <xsl:when test="$str=''">
    </xsl:when>
    <xsl:when test="translate(substring($str,1,1),' &#10;&#13;&#9;',' ')=' '">
      <xsl:call-template name="eat-leading-whitespace">
        <xsl:with-param name="str" select="substring($str,2)"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="$str"/>
    </xsl:otherwise>
  </xsl:choose>

</xsl:template>

<!-- diag support -->
<xsl:template name="lineno">
  <xsl:if test="function-available('saxon-old:line-number')" use-when="function-available('saxon-old:line-number')">
    <xsl:if test="saxon-old:line-number() > 0">
      <xsl:text> (at line </xsl:text>
      <xsl:value-of select="saxon-old:line-number()"/>
      <xsl:if test="function-available('saxon-old:systemId')">
        <xsl:variable name="rootsys">
          <xsl:for-each select="/*">
            <xsl:value-of select="saxon-old:systemId()"/>
          </xsl:for-each>
        </xsl:variable>
        <xsl:if test="$rootsys != saxon-old:systemId()">
          <xsl:text> of </xsl:text>
          <xsl:value-of select="saxon-old:systemId()"/>
        </xsl:if>
      </xsl:if>
      <xsl:text>)</xsl:text>
    </xsl:if>
  </xsl:if>
  <xsl:if test="function-available('saxon:line-number')" use-when="function-available('saxon:line-number')">
    <xsl:if test="saxon:line-number() > 0">
      <xsl:text> (at line </xsl:text>
      <xsl:value-of select="saxon:line-number()"/>
      <xsl:if test="function-available('saxon:systemId')">
        <xsl:variable name="rootsys">
          <xsl:for-each select="/*">
            <xsl:value-of select="saxon:systemId()"/>
          </xsl:for-each>
        </xsl:variable>
        <xsl:if test="$rootsys != saxon:systemId()">
          <xsl:text> of </xsl:text>
          <xsl:value-of select="saxon:systemId()"/>
        </xsl:if>
      </xsl:if>
      <xsl:text>)</xsl:text>
    </xsl:if>
  </xsl:if>
</xsl:template>

<!-- define exslt:node-set for msxml -->
<msxsl:script language="JScript" implements-prefix="exslt">
  this['node-set'] = function (x) {
    return x;
  }
</msxsl:script>

<!-- date handling -->

<msxsl:script language="JScript" implements-prefix="date">
  function twodigits(s) {
    return s &lt; 10 ? "0" + s : s;
  }

  this['date-time'] = function (x) {
    var now = new Date();
    var offs = now.getTimezoneOffset();
    return now.getFullYear() + "-"
      + twodigits(1 + now.getMonth()) + "-"
      + twodigits(now.getDate()) + "T"
      + twodigits(now.getHours()) + ":"
      + twodigits(now.getMinutes()) + ":"
      + twodigits(now.getSeconds())
      + (offs >= 0 ? "-" : "+")
      + twodigits(Math.abs(offs) / 60) + ":"
      + twodigits(Math.abs(offs) % 60);
  }
</msxsl:script>

<xsl:variable name="current-year">
  <xsl:choose>
    <xsl:when test="$xml2rfc-ext-use-system-time='no'"/>
    <xsl:when test="function-available('date:date-time')" use-when="function-available('date:date-time')">
      <xsl:value-of select="substring-before(date:date-time(),'-')"/>
    </xsl:when>
    <xsl:when test="function-available('current-date')">
      <xsl:value-of select="substring-before(string(current-date()),'-')"/>
    </xsl:when>
    <xsl:otherwise/>
  </xsl:choose>
</xsl:variable>

<xsl:variable name="current-month">
  <xsl:choose>
    <xsl:when test="$xml2rfc-ext-use-system-time='no'"/>
    <xsl:when test="function-available('date:date-time')" use-when="function-available('date:date-time')">
      <xsl:value-of select="substring-before(substring-after(date:date-time(),'-'),'-')"/>
    </xsl:when>
    <xsl:when test="function-available('current-date')">
      <xsl:value-of select="substring-before(substring-after(string(current-date()),'-'),'-')"/>
    </xsl:when>
    <xsl:otherwise/>
  </xsl:choose>
</xsl:variable>

<xsl:variable name="current-day">
  <xsl:choose>
    <xsl:when test="$xml2rfc-ext-use-system-time='no'"/>
    <xsl:when test="function-available('date:date-time')" use-when="function-available('date:date-time')">
      <xsl:value-of select="substring-after(substring-after(substring-before(date:date-time(),'T'),'-'),'-')"/>
    </xsl:when>
    <xsl:when test="function-available('current-dateTime')">
      <xsl:value-of select="substring-after(substring-after(substring-before(string(current-dateTime()),'T'),'-'),'-')"/>
    </xsl:when>
    <xsl:otherwise/>
  </xsl:choose>
</xsl:variable>

<xsl:variable name="may-default-dates">
  <xsl:choose>
    <xsl:when test="$current-year!='' and $current-month!='' and $current-day!=''">
      <xsl:variable name="year-specified" select="/rfc/front/date/@year and /rfc/front/date/@year!=''"/>
      <xsl:variable name="month-specified" select="/rfc/front/date/@month and /rfc/front/date/@month!=''"/>
      <xsl:variable name="day-specified" select="/rfc/front/date/@day and /rfc/front/date/@day!=''"/>
      <xsl:variable name="system-month">
        <xsl:call-template name="get-month-as-name">
          <xsl:with-param name="month" select="$current-month"/>
        </xsl:call-template>
      </xsl:variable>
      <xsl:choose>
        <xsl:when test="$year-specified and /rfc/front/date/@year!=$current-year">Specified year <xsl:value-of select="/rfc/front/date/@year"/> does not match system date (<xsl:value-of select="$current-year"/>)</xsl:when>
        <xsl:when test="$month-specified and /rfc/front/date/@month!=$system-month">Specified month <xsl:value-of select="/rfc/front/date/@month"/> does not match system date (<xsl:value-of select="$system-month"/>)</xsl:when>
        <xsl:when test="$day-specified and /rfc/front/date/@day!=$current-day">Specified day does not match system date</xsl:when>
        <xsl:when test="not($year-specified) and ($month-specified or $day-specified)">Can't default year when month or day is specified</xsl:when>
        <xsl:when test="not($month-specified) and $day-specified">Can't default month when day is specified</xsl:when>
        <xsl:otherwise>yes</xsl:otherwise>
      </xsl:choose>
    </xsl:when>
    <!-- may, but won't -->
    <xsl:otherwise>yes</xsl:otherwise>
  </xsl:choose>
</xsl:variable>

<xsl:param name="xml2rfc-ext-pub-year">
  <xsl:choose>
    <xsl:when test="/rfc/front/date/@year and /rfc/front/date/@year!=''">
      <xsl:value-of select="/rfc/front/date/@year"/>
    </xsl:when>
    <xsl:when test="$current-year!='' and $may-default-dates='yes'">
      <xsl:value-of select="$current-year"/>
    </xsl:when>
    <xsl:when test="$current-year!='' and $may-default-dates!='yes'">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg" select="$may-default-dates"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="error">
        <xsl:with-param name="msg" select="'/rfc/front/date/@year missing (and XSLT processor cannot compute the system date)'"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:param>

<xsl:param name="xml2rfc-ext-pub-month">
  <xsl:choose>
    <xsl:when test="/rfc/front/date/@month and /rfc/front/date/@month!=''">
      <xsl:variable name="m" select="/rfc/front/date/@month"/>
      <xsl:choose>
        <xsl:when test="string(number($m))!='NaN' and number($m) &gt; 0 and number($m) &lt; 13">
          <xsl:call-template name="get-month-as-name">
            <xsl:with-param name="month" select="$m"/>
          </xsl:call-template>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="$m"/>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:when>
    <xsl:when test="$current-month!='' and $may-default-dates='yes'">
      <xsl:call-template name="get-month-as-name">
        <xsl:with-param name="month" select="$current-month"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:when test="$current-month!='' and $may-default-dates!='yes'">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg" select="$may-default-dates"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="error">
        <xsl:with-param name="msg" select="'/rfc/front/date/@month missing (and XSLT processor cannot compute the system date)'"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:param>

<xsl:param name="pub-month-numeric">
  <xsl:call-template name="get-month-as-num">
    <xsl:with-param name="month" select="$xml2rfc-ext-pub-month" />
  </xsl:call-template>
</xsl:param>

<xsl:param name="xml2rfc-ext-pub-day">
  <xsl:choose>
    <xsl:when test="/rfc/front/date/@day and /rfc/front/date/@day!=''">
      <xsl:value-of select="/rfc/front/date/@day"/>
    </xsl:when>
    <xsl:when test="$current-day!='' and $may-default-dates='yes'">
      <xsl:value-of select="$current-day"/>
    </xsl:when>
    <xsl:otherwise /> <!-- harmless, we just don't have it -->
  </xsl:choose>
</xsl:param>

<xsl:param name="pub-yearmonth">
  <!-- year or 0000 -->
  <xsl:choose>
    <xsl:when test="$xml2rfc-ext-pub-year!=''">
      <xsl:value-of select="format-number($xml2rfc-ext-pub-year,'0000')"/>
    </xsl:when>
    <xsl:otherwise>0000</xsl:otherwise>
  </xsl:choose>
  <!-- month or 00 -->
  <xsl:choose>
    <xsl:when test="number($pub-month-numeric) &gt; 0">
      <xsl:value-of select="format-number($pub-month-numeric,'00')"/>
    </xsl:when>
    <xsl:otherwise>00</xsl:otherwise>
  </xsl:choose>
</xsl:param>

<!-- <u> element -->
<xsl:template name="convert-u-compact-remainder">
  <xsl:param name="f"/>
  <xsl:choose>
    <xsl:when test="contains($f,'-')">
      <xsl:text>{</xsl:text>
        <xsl:value-of select="substring-before($f,'-')"/>
      <xsl:text>}, </xsl:text>
      <xsl:call-template name="convert-u-compact-remainder">
        <xsl:with-param name="f" select="substring-after($f,'-')"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:otherwise>
      <xsl:text>{</xsl:text>
      <xsl:value-of select="$f"/>
      <xsl:text>}</xsl:text>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="convert-u-compact">
  <xsl:param name="f"/>
  <xsl:choose>
    <xsl:when test="contains($f,'-')">
      <xsl:text>{</xsl:text>
      <xsl:value-of select="substring-before($f,'-')"/>
      <xsl:text>}</xsl:text>
    </xsl:when>
    <xsl:otherwise>
      <xsl:text>{</xsl:text>
      <xsl:value-of select="$f"/>
      <xsl:text>}</xsl:text>
    </xsl:otherwise>
  </xsl:choose>
  <xsl:if test="contains($f,'-')">
    <xsl:text> (</xsl:text>
      <xsl:call-template name="convert-u-compact-remainder">
        <xsl:with-param name="f" select="substring-after($f,'-')"/>
      </xsl:call-template>
    <xsl:text>)</xsl:text>
  </xsl:if>
</xsl:template>

<xsl:template name="u-hex2">
  <xsl:param name="n"/>
  <xsl:variable name="hex">0123456789ABCDEF</xsl:variable>

  <xsl:if test="$n &gt;= 16">
    <xsl:call-template name="u-hex2">
      <xsl:with-param name="n" select="floor($n div 16)"/>
    </xsl:call-template>
  </xsl:if>
  <xsl:value-of select="substring($hex, 1 + ($n mod 16), 1)"/>
</xsl:template>

<xsl:template name="u-hex">
  <xsl:param name="n"/>
  <xsl:variable name="t">
    <xsl:call-template name="u-hex2">
      <xsl:with-param name="n" select="$n"/>
    </xsl:call-template>
  </xsl:variable>
  <xsl:if test="string-length($t) &lt; 4">
    <xsl:value-of select="substring('0000',1,4-string-length($t))"/>
  </xsl:if>
  <xsl:value-of select="$t"/>
</xsl:template>

<xsl:template name="u-expanded-name">
  <xsl:param name="lit"/>
  <xsl:choose>
    <xsl:when test="string-length($lit)=0"></xsl:when>
    <xsl:otherwise>
      <xsl:call-template name="name-of-first-char">
        <xsl:with-param name="lit" select="$lit"/>
      </xsl:call-template>
      <xsl:if test="string-length($lit)!=1">
        <xsl:text>, </xsl:text>
        <xsl:call-template name="u-expanded-name">
          <xsl:with-param name="lit" select="substring($lit,2)"/>
        </xsl:call-template>
      </xsl:if>
    </xsl:otherwise> 
  </xsl:choose>  
</xsl:template>

<xsl:template name="name-of-first-char">
  <xsl:param name="lit"/>
  <xsl:variable name="c" select="substring($lit,1,1)"/>
  <xsl:variable name="map" select="//x:u-map/x:c[@c=$c][@d]"/>
  <xsl:choose>
    <xsl:when test="$map">
      <xsl:value-of select="$map/@d"/>
    </xsl:when>
    <xsl:when test="$xml2rfc-ext-ucd-file!='' and document($xml2rfc-ext-ucd-file)/x:u-map/x:c[@c=$c]">
      <xsl:value-of select="document($xml2rfc-ext-ucd-file)/x:u-map/x:c[@c=$c]/@d"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:text>???</xsl:text>
      <xsl:call-template name="error">
        <xsl:with-param name="msg">
          <xsl:text>'name' expansion for &lt;u>: character '</xsl:text>
          <xsl:value-of select="$c"/>
          <xsl:text>' requires local definition using x:u-map or local UCD mapping file </xsl:text>
          <xsl:choose>
            <xsl:when test="$xml2rfc-ext-ucd-file=''">which can be specified using the 'ucd-file' directive</xsl:when>
            <xsl:otherwise>'<xsl:value-of select="$xml2rfc-ext-ucd-file"/>'</xsl:otherwise>
          </xsl:choose>
        </xsl:with-param>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="u-expanded-num">
  <xsl:param name="lit"/>
  <xsl:choose>
    <xsl:when test="string-length($lit)=0"></xsl:when>
    <xsl:otherwise>
      <xsl:text>U+</xsl:text>
      <xsl:variable name="n">
        <xsl:call-template name="codepoint-of-first-char">
          <xsl:with-param name="lit" select="$lit"/>
        </xsl:call-template>
      </xsl:variable>
      <xsl:call-template name="u-hex">
        <xsl:with-param name="n" select="$n"/>
      </xsl:call-template>
      <xsl:if test="string-length($lit)!=1">
        <xsl:text> </xsl:text>
        <xsl:call-template name="u-expanded-num">
          <xsl:with-param name="lit" select="substring($lit,2)"/>
        </xsl:call-template>
      </xsl:if>
    </xsl:otherwise> 
  </xsl:choose>  
</xsl:template>

<xsl:template name="codepoint-of-first-char">
  <xsl:param name="lit"/>
  <xsl:variable name="c" select="substring($lit,1,1)"/>
  <xsl:choose>
    <xsl:when test="not(function-available('string-to-codepoints'))">
      <xsl:variable name="map" select="//x:u-map/x:c[@c=$c]"/>
      <xsl:variable name="asciistring"> !"#$%&amp;'()*+,-./<xsl:value-of select="$digits"/>:;&lt;=>?@<xsl:value-of select="$ucase"/>[\]^_`<xsl:value-of select="$lcase"/>{|}~&#127;</xsl:variable>
      <xsl:choose>
        <xsl:when test="contains($asciistring,$c)">
          <xsl:value-of select="32 + string-length(substring-before($asciistring,$c))"/>
        </xsl:when>
        <xsl:when test="$map">
          <xsl:value-of select="number($map/@n)"/>
        </xsl:when>
        <xsl:when test="$xml2rfc-ext-ucd-file!='' and document($xml2rfc-ext-ucd-file)/x:u-map/x:c[@c=substring($lit,1,1)]">
          <xsl:value-of select="document($xml2rfc-ext-ucd-file)/x:u-map/x:c[@c=substring($lit,1,1)]/@n"/>
        </xsl:when>
        <xsl:otherwise>
          <xsl:call-template name="error">
            <xsl:with-param name="msg">'<xsl:value-of select="$xml2rfc-ext-ucd-file"/>'
              <xsl:text>'num' expansion for &lt;u>: character '</xsl:text>
              <xsl:value-of select="$c"/>
              <xsl:text>' requires XSLT 2, local definition using x:u-map, or local UCD mapping file </xsl:text>
              <xsl:choose>
                <xsl:when test="$xml2rfc-ext-ucd-file=''">which can be specified using the 'ucd-file' directive</xsl:when>
                <xsl:otherwise>'<xsl:value-of select="$xml2rfc-ext-ucd-file"/>'</xsl:otherwise>
              </xsl:choose>
            </xsl:with-param>
          </xsl:call-template>
          <xsl:value-of select="number(65533)"/>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:when>
    <xsl:otherwise>
      <xsl:value-of select="number(string-to-codepoints($c))"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="u-expanded">
  <xsl:param name="format"/>
  <xsl:param name="lit"/>
  <xsl:param name="ascii"/>

  <xsl:choose>
    <xsl:when test="starts-with($format,'{') and contains($format,'}')">
      <xsl:variable name="tok" select="substring(substring-before($format,'}'),2)"/>
      <xsl:choose>
        <xsl:when test="$tok='lit'">
          <xsl:text>"</xsl:text>
          <xsl:value-of select="$lit"/>
          <xsl:text>"</xsl:text>
        </xsl:when>
        <xsl:when test="$tok='ascii'">
          <xsl:text>"</xsl:text>
          <xsl:value-of select="$ascii"/>
          <xsl:text>"</xsl:text>
        </xsl:when>
        <xsl:when test="$tok='name'">
          <xsl:call-template name="u-expanded-name">
            <xsl:with-param name="lit" select="$lit"/>
          </xsl:call-template>
        </xsl:when>
        <xsl:when test="$tok='num'">
          <xsl:call-template name="u-expanded-num">
            <xsl:with-param name="lit" select="$lit"/>
          </xsl:call-template>
        </xsl:when>
        <xsl:otherwise>
          <xsl:call-template name="warning">
            <xsl:with-param name="msg">unknown expansion for &lt;u>: <xsl:value-of select="$tok"/></xsl:with-param>
          </xsl:call-template>
        </xsl:otherwise>
      </xsl:choose>
      <xsl:call-template name="u-expanded">
        <xsl:with-param name="format" select="substring-after($format,'}')"/>
        <xsl:with-param name="lit" select="$lit"/>
      </xsl:call-template>
    </xsl:when>
    <xsl:when test="starts-with($format,'{')">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">Broken format string for &lt;u>: <xsl:value-of select="$format"/></xsl:with-param>
      </xsl:call-template>
    </xsl:when>
    <xsl:when test="not(contains($format,'{'))">
      <xsl:value-of select="$format"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:variable name="s" select="substring-before($format,'{')"/>
      <xsl:value-of select="$s"/>
      <xsl:call-template name="u-expanded">
        <xsl:with-param name="format" select="substring($format, 1+string-length($s))"/>
        <xsl:with-param name="lit" select="$lit"/>
      </xsl:call-template>
    </xsl:otherwise>
  </xsl:choose>  
</xsl:template>

<xsl:template name="emit-u">
  <xsl:variable name="format">
    <xsl:choose>
      <xsl:when test="@format!=''">
        <xsl:value-of select="@format"/>
      </xsl:when>
      <xsl:otherwise>lit-name-num</xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <xsl:variable name="f">
    <xsl:choose>
      <xsl:when test="translate($format,concat($lcase,'-'),'')=''">
        <!-- compact notation -->
        <xsl:call-template name="convert-u-compact">
          <xsl:with-param name="f" select="$format"/>
        </xsl:call-template>
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="$format"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:variable>
  <xsl:call-template name="u-expanded">
    <xsl:with-param name="format" select="$f"/>
    <xsl:with-param name="lit" select="."/>
    <xsl:with-param name="ascii" select="@ascii"/>
  </xsl:call-template>
</xsl:template>

<xsl:template match="u">
  <xsl:call-template name="emit-u"/>
</xsl:template>

<xsl:template match="x:u-map"/>

<!-- simple validation support -->

<xsl:template match="*" mode="validate">
  <xsl:apply-templates select="@*|*" mode="validate"/>
</xsl:template>
<xsl:template match="@*" mode="validate"/>

<xsl:template name="validation-error">
  <xsl:param name="additionalDiagnostics"/>
  <xsl:variable name="pname">
    <xsl:if test="namespace-uri(..)!=''">
      <xsl:value-of select="concat('{',namespace-uri(..),'}')"/>
    </xsl:if>
    <xsl:value-of select="local-name(..)"/>
  </xsl:variable>
  <xsl:variable name="cname">
    <xsl:if test="namespace-uri(.)!=''">
      <xsl:value-of select="concat('{',namespace-uri(.),'}')"/>
    </xsl:if>
    <xsl:value-of select="local-name(.)"/>
  </xsl:variable>
  <xsl:call-template name="error">
    <xsl:with-param name="msg" select="concat($cname,' not allowed inside ',$pname,$additionalDiagnostics)"/>
    <xsl:with-param name="inline" select="'no'"/>
  </xsl:call-template>
</xsl:template>

<!-- artwork/sourcecode element -->
<xsl:template match="blockquote/artwork | figure/artwork | figure/ed:replace/ed:*/artwork | section/artwork | li/artwork | dd/artwork | artset/artwork" mode="validate" priority="9">
  <xsl:apply-templates select="@*|*" mode="validate"/>
</xsl:template>
<xsl:template match="blockquote/sourcecode | figure/sourcecode | figure/ed:replace/ed:*/sourcecode | section/sourcecode | li/sourcecode | dd/sourcecode | td/sourcecode" mode="validate" priority="9">
  <xsl:apply-templates select="@*|*" mode="validate"/>
</xsl:template>
<xsl:template match="artwork|sourcecode" mode="validate">
  <xsl:call-template name="validation-error"/>
  <xsl:apply-templates select="@*|*" mode="validate"/>
</xsl:template>

<!-- author element -->
<xsl:template match="front/author" mode="validate" priority="9">
  <xsl:apply-templates select="@*|*" mode="validate"/>
</xsl:template>
<xsl:template match="author" mode="validate">
  <xsl:call-template name="validation-error"/>
  <xsl:apply-templates select="@*|*" mode="validate"/>
</xsl:template>

<!-- li element -->
<xsl:template match="ol/li | ul/li" mode="validate" priority="9">
  <xsl:apply-templates select="@*|*" mode="validate"/>
</xsl:template>
<xsl:template match="li" mode="validate">
  <xsl:call-template name="validation-error"/>
  <xsl:apply-templates select="@*|*" mode="validate"/>
</xsl:template>

<!-- list element -->
<xsl:template match="t/list | t/ed:replace/ed:*/list" mode="validate" priority="9">
  <xsl:apply-templates select="@*|*" mode="validate"/>
</xsl:template>
<xsl:template match="list" mode="validate">
  <xsl:call-template name="validation-error"/>
  <xsl:apply-templates select="@*|*" mode="validate"/>
</xsl:template>

<!-- dl element -->
<xsl:template match="abstract/dl | aside/dl | blockquote/dl | dd/dl | li/dl | note/dl | section/dl | td/dl | th/dl" mode="validate" priority="9">
  <xsl:apply-templates select="@*|*" mode="validate"/>
</xsl:template>
<xsl:template match="dl" mode="validate">
  <xsl:call-template name="validation-error"/>
  <xsl:apply-templates select="@*|*" mode="validate"/>
</xsl:template>

<!-- t element -->
<xsl:template match="abstract/t | abstract/ed:replace/ed:*/t |
                     list/t | list/ed:replace/ed:*/t |
                     note/t | note/ed:replace/ed:*/t |
                     section/t | section/ed:replace/ed:*/t |
                     blockquote/t |
                     x:blockquote/t | x:blockquote/ed:replace/ed:*/t |
                     x:note/t | x:note/ed:replace/ed:*/t |
                     aside/t |
                     td/t | th/t |
                     x:lt/t | li/t | x:lt/ed:replace/ed:*/t | dd/t" mode="validate" priority="9">
  <xsl:apply-templates select="@*|*" mode="validate"/>
</xsl:template>
<xsl:template match="t" mode="validate">
  <xsl:call-template name="validation-error"/>
  <xsl:apply-templates select="@*|*" mode="validate"/>
</xsl:template>

<!-- xref element -->
<xsl:template match="abstract//xref" mode="validate">
  <xsl:call-template name="validation-error">
    <xsl:with-param name="additionalDiagnostics"> (inside &lt;abstract>)</xsl:with-param>
  </xsl:call-template>
  <xsl:apply-templates select="@*|*" mode="validate"/>
</xsl:template>

<xsl:template name="check-no-text-content">
  <xsl:for-each select="text()">
    <xsl:if test="normalize-space(.)!=''">
      <xsl:call-template name="warning">
        <xsl:with-param name="msg">No text content allowed inside &lt;<xsl:value-of select="local-name(..)"/>&gt;, but found: '<xsl:value-of select="."/>'</xsl:with-param>
      </xsl:call-template>
    </xsl:if>
  </xsl:for-each>
</xsl:template>

<xsl:template name="render-name">
  <xsl:param name="n"/>
  <xsl:param name="strip-links" select="true()"/>
  <xsl:variable name="t">
    <xsl:apply-templates select="$n"/>
  </xsl:variable>
  <xsl:choose>
    <xsl:when test="not($strip-links)">
      <xsl:copy-of select="exslt:node-set($t)"/>
    </xsl:when>
    <xsl:otherwise>
      <xsl:apply-templates select="exslt:node-set($t)" mode="strip-links"/>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template name="render-name-ref">
  <xsl:param name="n"/>
  <xsl:variable name="t">
    <xsl:call-template name="render-name">
      <xsl:with-param name="n" select="$n"/>
    </xsl:call-template>
  </xsl:variable>
  <xsl:apply-templates select="exslt:node-set($t)" mode="strip-ids-and-linebreaks"/>
</xsl:template>

<!-- clean up links from HTML -->
<xsl:template match="comment()|@*" mode="strip-links"><xsl:copy/></xsl:template>
<xsl:template match="text()" mode="strip-links"><xsl:copy/></xsl:template>
<xsl:template match="*" mode="strip-links">
  <xsl:element name="{local-name()}">
  	<xsl:apply-templates select="@*|node()" mode="strip-links" />
  </xsl:element>
</xsl:template>
<xsl:template match="a|xhtml:a" mode="strip-links" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <xsl:choose>
    <xsl:when test="@id">
      <span id="{@id}">
      	<xsl:apply-templates select="node()" mode="strip-links" />
      </span>
    </xsl:when>
    <xsl:otherwise>
    	<xsl:apply-templates select="node()" mode="strip-links" />
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

<xsl:template match="node()|@*" mode="strip-ids-and-linebreaks">
  <xsl:copy>
	  <xsl:apply-templates select="node()|@*" mode="strip-ids-and-linebreaks" />
  </xsl:copy>
</xsl:template>
<xsl:template match="xhtml:br" mode="strip-ids-and-linebreaks">
  <xsl:text> </xsl:text>
</xsl:template>
<xsl:template match="@id" mode="strip-ids-and-linebreaks"/>


<!-- customization: these templates can be overridden in an XSLT that imports from this one -->
<xsl:template name="add-start-material"/>
<xsl:template name="add-end-material"/>

</xsl:transform>
