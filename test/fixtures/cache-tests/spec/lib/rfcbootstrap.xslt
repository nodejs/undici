<!--
    XSLT transformation from RFC2629 XML format to Bootstrap-ised HTML

    Copyright (c) 2014-2015, Mark Nottingham (mnot@mnot.net)
    All rights reserved.

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright notice,
      this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright notice,
      this list of conditions and the following disclaimer in the documentation
      and/or other materials provided with the distribution.
    * Neither the name of Mark Nottingham nor the names of its contributors
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


    Based upon Julian Reschke's rfc2629.xslt:

    Copyright (c) 2006-2014, Julian Reschke (julian.reschke@greenbytes.de)
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
                xmlns:msxsl="urn:schemas-microsoft-com:xslt"
                xmlns:myns="mailto:julian.reschke@greenbytes.de?subject=rcf2629.xslt"
                xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
                xmlns:saxon="http://saxon.sf.net/"
                xmlns:saxon-old="http://icl.com/saxon"
                xmlns:x="http://purl.org/net/xml2rfc/ext"
                xmlns:xhtml="http://www.w3.org/1999/xhtml"

                exclude-result-prefixes="date ed exslt msxsl myns rdf saxon saxon-old x xhtml"
                >

  <xsl:import href="rfc2629.xslt"/>

  <xsl:strip-space elements="abstract author back figure front list middle note postal reference references rfc section texttable"/>

  <xsl:output method="html" encoding="utf-8" indent="no" doctype-system="about:legacy-compat" />

  <!-- CSS mapping -->
  <xsl:param name="xml2rfc-ext-css-map">cssmap.xml</xsl:param>

  <!-- Library URLs -->
  <xsl:param name="bootstrapCssUrl"
           select="'https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css'" />
  <xsl:param name="bootstrapJsUrl"
           select="'https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/js/bootstrap.min.js'" />
  <xsl:param name="jqueryJsUrl"
           select="'https://code.jquery.com/jquery-3.3.1.slim.min.js'" />

  <!-- navbar -->
  <xsl:param name="navbar" select="''" />

  <!-- site URLs -->
  <xsl:param name="siteCssUrl" select="''" />
  <xsl:param name="siteJsUrl" select="''" />

  <!-- page URL -->
  <xsl:param name="pageUrl" select="''" />

  <!-- page image URL -->
  <xsl:param name="pageImageUrl" select="''" />

  <!-- site name -->
  <xsl:param name="siteName" select="''" />

  <!-- optional banner -->
  <xsl:param name="banner" select="''" />

  <!-- disable built-in ToC -->
  <xsl:variable name="xml2rfc-toc">yes</xsl:variable>

  <xsl:variable name="toc-ul-class" select="'nav-sublist list-unstyled'" />

  <xsl:template name="body">
      <body>
        <xsl:variable name="onload">
          <xsl:if test="$xml2rfc-ext-insert-metadata='yes' and /rfc/@number">getMeta(<xsl:value-of select="/rfc/@number"/>,"rfc.meta");</xsl:if>
          <xsl:if test="/rfc/x:feedback">initFeedback();</xsl:if>
          <xsl:if test="$xml2rfc-ext-refresh-from!=''">RfcRefresh.initRefresh()</xsl:if>
        </xsl:variable>
        <xsl:if test="$onload!=''">
          <xsl:attribute name="onload">
            <xsl:value-of select="$onload"/>
          </xsl:attribute>
        </xsl:if>

        <xsl:if test="$navbar!=''">
          <xsl:copy-of select="document($navbar)"/>
        </xsl:if>

        <!-- insert diagnostics -->
        <xsl:call-template name="insert-diagnostics"/>

        <div class="container" id="top">
          <div class="row">
            <div class="col-lg-4 order-last d-none d-lg-block" id="sidebar" role="navigation">
              <div class="navbar">
                <div class="navbar-brand">
                  <a href="#top">
                    <xsl:choose>
                      <xsl:when test="/rfc/@number"><strong>RFC </strong><xsl:value-of select="/rfc/@number"/></xsl:when>
                    </xsl:choose>
                  </a>
                </div>
                <br clear="all"/>
                <div class="">
                    <xsl:apply-templates select="/" mode="toc">
                      <xsl:with-param name="extra"></xsl:with-param>
                    </xsl:apply-templates>
                </div>
              </div>
            </div>
            <div class="col-lg-8 order-first main" role="main">
              <xsl:apply-templates select="front" />
              <xsl:apply-templates select="middle" />
              <xsl:call-template name="back" />
            </div>
          </div>
        </div>
        <xsl:if test="$siteJsUrl!=''">
          <script src="{$siteJsUrl}" type="module"></script>
        </xsl:if>
      </body>
  </xsl:template>


  <xsl:template name="insertCss">
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <meta property="og:type" content="article" />
    <xsl:choose>
      <xsl:when test="$rfcno!=''">
        <meta property="og:title" content="{concat('RFC', $rfcno)}" />
        <xsl:element name="meta">
          <xsl:attribute name="property">og:description</xsl:attribute>
          <xsl:attribute name="content">
            <xsl:apply-templates select="front/title" mode="get-text-content" />
          </xsl:attribute>
        </xsl:element>
      </xsl:when>
      <xsl:otherwise>
        <xsl:element name="meta">
          <xsl:attribute name="property">og:title</xsl:attribute>
          <xsl:attribute name="content">
            <xsl:apply-templates select="front/title" mode="get-text-content" />
          </xsl:attribute>
        </xsl:element>
        <meta property="og:description" content="{normalize-space(front/abstract)}" />
      </xsl:otherwise>
    </xsl:choose>
    <xsl:if test="$pageUrl!=''">
      <meta property="og:url" content="{$pageUrl}" />
    </xsl:if>
    <xsl:if test="$siteName!=''">
      <meta property="og:site_name" content="{$siteName}" />
    </xsl:if>
    <xsl:if test="$pageImageUrl!=''">
      <meta property="og:image" content="{$pageImageUrl}" />
    </xsl:if>
    <link rel="stylesheet" type="text/css" href="{$bootstrapCssUrl}" />
    <style type="text/css">
      body {
        padding-top: 80px;
        padding-bottom: 80px;
        position: relative;
      }
      .table.header th, .table.header td {
        border-top: none;
        padding: 0;
      }
      #sidebar {
        margin-top: -10px;
        height: 90%;
        overflow-y: auto;
        font-size: 90%;
      }
      #rfc\.meta {
        width: 40%;
        float: right
      }
      .toc ul {
        list-style: none;
      }
      .filename {
        color: rgb(119, 119, 119);
        font-size: 23px;
        font-weight: normal;
        height: auto;
        line-height: 23px;
      }
      dl {
        margin-left: 1em;
      }
      dl.dl-horizontal: {
        margin-left: 0;
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
        margin-bottom: 0em;
      }
      dl > dd > dl {
        margin-top: 0.5em;
        margin-bottom: 0em;
      }
      ul.empty {<!-- spacing between two entries in definition lists -->
        list-style-type: none;
      }
      ul.empty li {
        margin-top: .5em;
      }
      td.reference {
        padding-right: 1em;
        vertical-align: top;
      }
      .feedback {
        position: fixed;
        bottom: 5px;
        right: 5px;
      }
      .fbbutton {
        margin-left: 5px;
      }
      h1 a, h2 a, h3 a, h4 a, h5 a, h6 a {
        color: rgb(51, 51, 51);
      }
      span.tt {
        font: 11pt consolas, monospace;
        font-size-adjust: none;
      }
      div.banner {
        background-color: #fee;
        border: 2px solid #633;
        padding: 8px 12px;
        margin-bottom: 10px;
      }
      div.banner p {
        font-size: 1.2em;
      }
    </style>
    <xsl:if test="$siteCssUrl!=''">
      <link rel="stylesheet" type="text/css" href="{$siteCssUrl}" />
    </xsl:if>
  </xsl:template>

  <xsl:template match="abstract">
    <xsl:call-template name="check-no-text-content"/>
    <hr/>
    <h2 id="{$anchor-pref}abstract"><a href="#{$anchor-pref}abstract">Abstract</a></h2>
    <div class="lead">
      <xsl:apply-templates />
    </div>
    <xsl:if test="$banner!=''">
      <div class="banner">
        <p><xsl:value-of select="$banner"/></p>
      </div>
    </xsl:if>

  </xsl:template>

  <xsl:template match="/" mode="toc">
    <xsl:param name="extra">d-lg-none</xsl:param>
    <div class="toc {$extra}">
      <ul>
        <xsl:apply-templates mode="toc" />
      </ul>
    </div>
  </xsl:template>

  <xsl:template name="insertTocAppendix">
  </xsl:template>

  <xsl:template name="get-generator">
    <xsl:variable name="gen">
      <xsl:text>https://github.com/mnot/RFCBootstrap </xsl:text>
      <xsl:value-of select="concat('XSLT vendor: ',system-property('xsl:vendor'),' ',system-property('xsl:vendor-url'))" />
    </xsl:variable>
    <xsl:value-of select="$gen" />
  </xsl:template>


</xsl:transform>
