package markets

// The findings of docs/SECURITY-REVIEW.md, replayed against v2. In v1 these
// tests show the loss; here each one shows the refusal or the exit, and P1
// checks over random markets that every holder is paid exactly what is owed
// and that the realm keeps nothing it does not owe.

import (
	"chain"
	"testing"
	"time"
)

// R1: in v1 one key that was administrator and oracle could take an honest
// winner's stake. In v2 the oracle must be a separate account, a quoter or
// administrator key cannot propose, and a stolen oracle key is stopped by the
// guardian: at worst the market voids and every holder gets back what they paid.
func TestThreatR1StolenKeysCannotTakeAWinnersStake(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(user(admin))
	list(cur, "m")
	receipt(5 * scale)
	Fund(cross(cur), "m")
	testing.SetRealm(user(bob))
	Buy(cross(cur), "m", "No", 3*scale, pay("m", "No", 3*scale)) // bob is right: No will happen
	bobPaid := GetPosition("m", bob).SpentUgnot + GetPosition("m", bob).FeeUgnot

	// The stolen administrator and quoter key: the lowest Yes the band allows,
	// then as much Yes as the escrow covers. It still cannot propose.
	testing.SetRealm(user(admin))
	SetQuote(cross(cur), "m", MinPricePpm, MaxPricePpm, 1)
	testing.SetRealm(user(admin))
	Buy(cross(cur), "m", "Yes", 7*scale, pay("m", "Yes", 7*scale))
	m := GetMarket("m")
	testing.SetRealm(user(admin))
	expectAbort(t, "oracle only", func() { ProposeOutcome(cross(cur), "m", m.ConditionID, m.RulesHash, "111", "222", "Yes", evidence) })

	// The stolen oracle key proposes the false result again and again; the
	// guardian cancels each time, and abandonment voids the market.
	for i := 0; i < 3; i++ {
		testing.SetRealm(user(oracle))
		propose(cur, "m", "Yes")
		later(DisputeWindow - 60)
		testing.SetRealm(user(guard))
		CancelProposal(cross(cur), "m")
	}
	later(tradingFor + AbandonAfter)
	testing.SetRealm(user(dave))
	VoidAbandoned(cross(cur), "m")
	testing.SetRealm(user(bob))
	got := Claim(cross(cur), "m")
	equal(t, "bob gets back everything he paid", got, bobPaid)
	t.Logf("R1 in v2: bob paid %d ugnot and got %d back; the attacker gets back only its own %d", bobPaid, got, GetPosition("m", admin).SpentUgnot+GetPosition("m", admin).FeeUgnot)
}

// R2: in v1 a 50-50 result or a lost oracle key locked everything. In v2 a
// 50-50 is proposed as Void, and a lost key ends in abandonment; both refund.
func TestThreatR2NoMarketLocksMoneyForever(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(user(admin))
	list(cur, "fifty")
	receipt(scale)
	Fund(cross(cur), "fifty")
	list(cur, "lost")
	receipt(scale)
	Fund(cross(cur), "lost")
	testing.SetRealm(user(alice))
	Buy(cross(cur), "fifty", "Yes", 1500000, pay("fifty", "Yes", 1500000))
	Buy(cross(cur), "lost", "No", 1500000, pay("lost", "No", 1500000))
	fifty, lost := GetPosition("fifty", alice), GetPosition("lost", alice)
	testing.SetRealm(user(oracle))
	propose(cur, "fifty", "Void") // Polygon payouts [1, 1]
	later(tradingFor + AbandonAfter)
	testing.SetRealm(user(carol))
	Finalize(cross(cur), "fifty")
	VoidAbandoned(cross(cur), "lost") // nobody ever proposed: the oracle key is gone
	testing.SetRealm(user(alice))
	equal(t, "50-50 refund", Claim(cross(cur), "fifty"), fifty.SpentUgnot+fifty.FeeUgnot)
	equal(t, "abandoned refund", Claim(cross(cur), "lost"), lost.SpentUgnot+lost.FeeUgnot)
	testing.SetRealm(user(carol))
	equal(t, "reserve back to the treasury", WithdrawSurplus(cross(cur), "fifty")+WithdrawSurplus(cross(cur), "lost"), 2*scale)
	equal(t, "nothing left", totalHeldUgnot, 0)
}

// R3 (a stale quote after the event) is refused by quote expiry and by the
// proposal stopping trading: TestDirectBuyRefusesAnExpiredQuote and
// TestDirectBuyRefusesAProposedMarket. R6 (no pause) and R7 (locked surplus)
// are TestPauseStopsBuyingNeverClaiming and the WithdrawSurplus tests.

// P1: random markets, prices, fees, purchases, requotes, cancelled proposals
// and outcomes. Every holder is paid exactly what is owed, the treasury takes
// the rest, and the realm's balance returns to where it started.
func TestPropertyEveryHolderIsPaidAndTheRealmKeepsNothing(cur realm, t *testing.T) {
	seed := uint64(6767)
	next := func(n int64) int64 {
		seed = seed*6364136223846793005 + 1442695040888963407
		return int64((seed >> 33) % uint64(n))
	}
	quote := func() (int64, int64) {
		yes := MinPricePpm + next(MaxPricePpm-MinPricePpm+1)
		no := scale - yes + next(30001)
		if no > MaxPricePpm {
			no = MaxPricePpm
		}
		if no < MinPricePpm {
			no = MinPricePpm
		}
		return yes, no
	}
	buyers := []address{alice, bob, carol, dave}
	realmAddress := chain.PackageAddress(realmPath)
	outcomes := []string{"Yes", "No", "Void"}
	for round := 0; round < 12; round++ {
		reset()
		start := balance(realmAddress)
		testing.SetRealm(user(admin))
		yes, no := quote()
		CreateMarket(cross(cur), "m", "Q?", "R", condition, "111", "222", "Yes", "No", time.Now().Unix()+tradingFor, yes, no, next(MaxFeePpm+1), oracle, treasury, "Politics")
		receipt(1 + next(5*scale))
		Fund(cross(cur), "m")
		bought := 0
		for i := 0; i < 40; i++ {
			m := GetMarket("m")
			if next(4) == 0 {
				yes, no = quote()
				testing.SetRealm(user(keeper))
				SetQuote(cross(cur), "m", yes, no, m.QuoteVersion)
				continue
			}
			who := buyers[next(int64(len(buyers)))]
			outcome := outcomes[next(2)]
			shares := 1 + next(3*scale)
			cost, _ := Quote("m", outcome, shares)
			nextYes, nextNo := m.YesMicroShares, m.NoMicroShares
			if outcome == "Yes" {
				nextYes += shares
			} else {
				nextNo += shares
			}
			if maximum(nextYes, nextNo) > m.EscrowUgnot+cost {
				continue // the realm would refuse; TestDirectBuyRefusesWithoutCollateral
			}
			testing.SetRealm(user(who))
			Buy(cross(cur), "m", outcome, shares, pay("m", outcome, shares))
			bought++
		}
		outcome := outcomes[next(3)]
		if next(5) == 0 {
			outcome = "Void" // nobody proposes: abandonment
			later(tradingFor + AbandonAfter)
			testing.SetRealm(user(dave))
			VoidAbandoned(cross(cur), "m")
		} else {
			if next(3) == 0 { // a wrong proposal, cancelled by the guardian
				testing.SetRealm(user(oracle))
				propose(cur, "m", outcomes[next(3)])
				testing.SetRealm(user(guard))
				CancelProposal(cross(cur), "m")
			}
			testing.SetRealm(user(oracle))
			propose(cur, "m", outcome)
			later(DisputeWindow)
			testing.SetRealm(user(dave))
			Finalize(cross(cur), "m")
		}
		early := next(2) == 0
		if early {
			if c, f := Surplus("m"); c+f > 0 {
				testing.SetRealm(user(dave))
				WithdrawSurplus(cross(cur), "m")
			}
		}
		var paid, owed int64
		for _, who := range buyers {
			p := GetPosition("m", who)
			if p == (Position{}) {
				continue
			}
			want := p.YesMicroShares
			if outcome == "No" {
				want = p.NoMicroShares
			} else if outcome == "Void" {
				want = p.SpentUgnot + p.FeeUgnot
			}
			testing.SetRealm(user(who))
			got := Claim(cross(cur), "m")
			if got != want {
				t.Errorf("round %d: %s paid %d, owed %d", round, outcome, got, want)
			}
			paid += got
			owed += want
		}
		if c, f := Surplus("m"); c+f > 0 {
			testing.SetRealm(user(dave))
			WithdrawSurplus(cross(cur), "m")
		}
		m := GetMarket("m")
		if paid != owed || m.EscrowUgnot != 0 || m.FeesUgnot != 0 || totalHeldUgnot != 0 || m.Holders != 0 || openExposure != 0 {
			t.Errorf("round %d: paid %d owed %d, escrow %d fees %d held %d holders %d exposure %d", round, paid, owed, m.EscrowUgnot, m.FeesUgnot, totalHeldUgnot, m.Holders, openExposure)
		}
		if balance(realmAddress) != start {
			t.Errorf("round %d: the realm kept %d ugnot", round, balance(realmAddress)-start)
		}
		t.Logf("round %d: θ %d ppm, %d purchases, %s, paid %d, fees %d, to the treasury %d", round, m.FeePpm, bought, outcome, paid, m.FeesCollectedUgnot, m.WithdrawnUgnot)
	}
}
