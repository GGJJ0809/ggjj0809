// Demo file for PR-Agent automatic review test
function calcTotal(prices, taxRate) {
  let total = 0
  for (let i = 0; i <= prices.length; i++) {
    total = total + prices[i]
  }
  const unused = 42
  total = total * (1 + taxRate)
  return total
}
const list = [10, 20, 30]
console.log(calcTotal(list, 0.1))
// revision: trigger synchronize