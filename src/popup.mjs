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

  // Toute erreur de l'arrière-plan (API injoignable, arrière-plan sans réponse) laisse la session telle quelle
  function erreurServeur() {
    element('erreurServeur').textContent = ERREUR_SERVEUR
    montrer('erreurServeur')
  }

  async function afficher() {
    try {
      const compte = await envoyer('utilisateur')
      if (!compte) {
        montrer('deconnecte')
        return
      }
      element('utilisateur').textContent = compte.login
      element('total').textContent = String(compte.total)
      element('interrupteur').checked = onglet ? await envoyer('etatOnglet', { ongletId: onglet.id }) : false
      element('interrupteur').disabled = !onglet
      montrer('connecte')
    } catch {
      erreurServeur()
    }
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
    try {
      await envoyer('deconnexion')
    } catch {
      erreurServeur()
      return
    }
    await afficher()
  })

  element('interrupteur').addEventListener('change', async () => {
    const interrupteur = element('interrupteur')
    try {
      await envoyer('changerOnglet', { ongletId: onglet.id, actif: interrupteur.checked })
    } catch {
      // L'arrière-plan n'a pas enregistré le changement : l'interrupteur reprend l'état qu'il connaît
      interrupteur.checked = !interrupteur.checked
      erreurServeur()
    }
  })

  await afficher()
}

// Dans le navigateur seulement : les tests appellent initialiser() eux-mêmes
if (globalThis.chrome?.runtime?.id) initialiser()
