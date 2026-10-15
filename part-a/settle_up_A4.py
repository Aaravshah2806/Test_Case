def settle(expenses):
    balances = {}

    # To calculate person net liquidity
    for payer, amount, people in expenses:
        balances[payer] = balances.get(payer, 0) + amount

        split_amount = amount / len(people)
        for person in people:
            balances[person] = balances.get(person, 0) - split_amount

    #Segregating debts, credits and settled
    debtors = []
    creditors = []
    completed = []

    for person, balance in balances.items():
        if balance < -0.005:
            debtors.append([person, -balance])
        elif balance > 0.005:
            creditors.append([person, balance])
        else:
            completed.append(f"{person} is fully settled.")

    debtors.sort(key=lambda x:x[1] , reverse=True)
    creditors.sort(key=lambda x:x[1], reverse=True)

    d = 0
    c = 0

    while d < len(debtors) and c < len(creditors):
        debtor, debt = debtors[d]
        creditor, credit = creditors[c]

        payment = min(debt, credit)

        payment_round = round(payment, 2)
        if payment_round.is_integer(): pay_str = f"{int(payment_round)}"
        else: pay_str = f"{payment_round}"

        completed.append(f"{debtor} pays {creditor} ₹{pay_str}")

        debtors[d][1] -= payment
        creditors[c][1] -= payment
        
        if debtors[d][1] < 0.005: d += 1
        if creditors[c][1] < 0.005: c += 1
    
    return completed

expense_input = [
    ("Akash", 900, ["Akash", "Neha", "Ravi"]),
    ("Neha", 300, ["Neha", "Ravi"]),
    ("Ravi", 600, ["Akash", "Neha", "Ravi", "Sam"])
]
        
output = settle(expense_input)

for trade in output:
    print(trade)