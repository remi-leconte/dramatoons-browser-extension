const ERREUR_SERVEUR = 'Erreur de connexion au serveur.'

async function envoyer(type, donnees = {}) {
  const reponse = await chrome.runtime.sendMessage({ type, ...donnees })
  if (!reponse?.ok) throw new Error(reponse?.erreur ?? "pas de réponse de l'arrière-plan")
  return reponse.resultat
}

export async function initialiser(doc = document) {
  const element = (id) => doc.getElementById(id)
  const [onglet] = await chrome.tabs.query({ active: true, currentWindow: true })

  function montrer(vue) {
    for (const id of ['erreurServeur', 'deconnecte', 'connecte']) element(id).hidden = id !== vue
  }

  async function afficher() {
    let compte
    try {
      compte = await envoyer('utilisateur')
    } catch {
      element('erreurServeur').textContent = ERREUR_SERVEUR
      montrer('erreurServeur')
      return
    }
    if (!compte) {
      montrer('deconnecte')
      return
    }
    element('utilisateur').textContent = compte.login
    element('total').textContent = String(compte.total)
    element('interrupteur').checked = onglet ? await envoyer('etatOnglet', { ongletId: onglet.id }) : false
    element('interrupteur').disabled = !onglet
    montrer('connecte')
  }

  element('formulaireConnexion').addEventListener('submit', async (evenement) => {
    evenement.preventDefault()
    const erreur = element('erreurConnexion')
    erreur.hidden = true
    let resultat
    try {
      resultat = await envoyer('connexion', { login: element('login').value, motDePasse: element('motDePasse').value })
    } catch {
      resultat = { ok: false, message: ERREUR_SERVEUR }
    }
    if (!resultat.ok) {
      erreur.textContent = resultat.message
      erreur.hidden = false
      return
    }
    element('motDePasse').value = ''
    await afficher()
  })

  element('deconnexion').addEventListener('click', async () => {
    await envoyer('deconnexion')
    await afficher()
  })

  element('interrupteur').addEventListener('change', async () => {
    await envoyer('changerOnglet', { ongletId: onglet.id, actif: element('interrupteur').checked })
  })

  await afficher()
}

// Dans le navigateur seulement : les tests appellent initialiser() eux-mêmes
if (globalThis.chrome?.runtime?.id) initialiser()
