<xsl:transform xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
               xmlns:x="http://purl.org/net/xml2rfc/ext"
               version="1.0" 
>

<xsl:output encoding="UTF-8" />

<!-- rules for identity transformations -->

<xsl:template match="node()|@*"><xsl:copy><xsl:apply-templates select="node()|@*" /></xsl:copy></xsl:template>

<xsl:template match="/">
	<xsl:copy><xsl:apply-templates select="node()" /></xsl:copy>
</xsl:template>

<xsl:template match="xref">
  <xsl:variable name="t" select="@target"/>
  <xsl:variable name="n" select="//*[@anchor=$t]"/>
  <xsl:choose>
    <xsl:when test="$n/self::x:has and $n/@target">
      <xref target="{$n/../../@anchor}" x:rel="#{$n/@target}"/>
    </xsl:when>
    <xsl:when test="$n/self::x:has">
      <xref target="{$n/../../@anchor}" x:rel="#{$t}"/>
    </xsl:when>
    <xsl:otherwise>
    	<xsl:copy><xsl:apply-templates select="@*|node()" /></xsl:copy>
    </xsl:otherwise>
  </xsl:choose>
</xsl:template>

</xsl:transform>