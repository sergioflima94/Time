// Synthetic identities only; exercise, never bypass, the real community gate.
module.exports = async function acceptFixtureTerms(page) {
  const checkbox=page.getByRole('checkbox',{name:'Aceito os termos e as regras da comunidade',exact:true});
  await checkbox.waitFor({state:'visible'});
  await checkbox.click();
  await page.getByRole('button',{name:'Aceitar e continuar',exact:true}).click();
  await page.getByText('Antes de participar',{exact:true}).waitFor({state:'hidden'});
};
