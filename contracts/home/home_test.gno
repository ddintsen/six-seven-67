package home

import (
	"strings"
	"testing"
)

func TestPages(t *testing.T) {
	page := Render("")
	for _, want := range []string{"# 67", "## Markets", "No markets are listed yet.", "## Four calls settle a market", "<gno-columns>", "(/r/nym-sixseven067/home:how)", "not affiliated with Polymarket"} {
		if !strings.Contains(page, want) {
			t.Errorf("home lacks %q:\n%s", want, page)
		}
	}
	how := Render("how")
	for _, want := range []string{"# A share pays 1 GNOT if it's right", "## The collateral", "(/r/nym-sixseven067/markets$help&func=Buy)"} {
		if !strings.Contains(how, want) {
			t.Errorf("how lacks %q", want)
		}
	}
	contract := Render("contract")
	for _, want := range []string{"### [Buy](/r/nym-sixseven067/markets$help&func=Buy)", "`send the exact quoted ugnot amount`", "## What it cannot do"} {
		if !strings.Contains(contract, want) {
			t.Errorf("contract lacks %q", want)
		}
	}
	if !strings.Contains(Render("elsewhere"), "# Page not found") {
		t.Error("unknown page differs")
	}
}

func TestFormatting(t *testing.T) {
	if priceText(420000) != "0.42" || priceText(425000) != "0.425" || priceText(1000000) != "1.00" || priceText(1) != "0.000001" || priceText(12500000) != "12.50" {
		t.Errorf("price text differs: %s %s %s %s %s", priceText(420000), priceText(425000), priceText(1000000), priceText(1), priceText(12500000))
	}
	if escapeText("a|b [c]") != `a\|b \[c\]` {
		t.Error("escape differs")
	}
}
