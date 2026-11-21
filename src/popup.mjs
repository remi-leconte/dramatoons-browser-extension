const ERREUR_SERVEUR = 'Erreur de connexion au serveur.'
const TOUS_LES_SITES = { origins: ['<all_urls>'] }

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

  let acces = true

  // Sans accès aux sites, l'onglet ne peut pas être activé ni rafraîchi, mais un onglet activé peut toujours être
  // désactivé
  function afficherInterrupteur(actif) {
    element('interrupteur').checked = actif
    element('interrupteur').disabled = !onglet || (!acces && !actif)
    element('rafraichir').disabled = false
    element('ligneRafraichir').hidden = !actif || !acces
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
      acces = await chrome.permissions.contains(TOUS_LES_SITES)
      element('acces').hidden = acces
      afficherInterrupteur(onglet ? await envoyer('etatOnglet', { ongletId: onglet.id }) : false)
      montrer('connecte')
    } catch {
      erreurServeur()
    }
  }

  // Résultat d'une activation ou d'un rafraîchissement : une session expirée ramène au formulaire
  async function appliquer(resultat) {
    if (resultat.deconnecte) await afficher()
    else afficherInterrupteur(resultat.actif)
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

  // Pendant une activation ou un rafraîchissement (jusqu'au délai de l'API), l'interrupteur et « Rafraîchir »
  // attendent la réponse : afficherInterrupteur() les rend ensuite selon l'état réel de l'onglet
  function patienter() {
    element('interrupteur').disabled = true
    element('rafraichir').disabled = true
  }

  element('interrupteur').addEventListener('change', async () => {
    const interrupteur = element('interrupteur')
    patienter()
    try {
      await appliquer(await envoyer('changerOnglet', { ongletId: onglet.id, actif: interrupteur.checked }))
    } catch {
      // L'arrière-plan n'a pas enregistré le changement : l'interrupteur reprend l'état qu'il connaît
      afficherInterrupteur(!interrupteur.checked)
      erreurServeur()
    }
  })

  // « Rafraîchir » recharge la liste et refait le surlignage ; afficher() met à jour le nombre de webtoons
  element('rafraichir').addEventListener('click', async () => {
    patienter()
    try {
      await appliquer(await envoyer('rafraichir', { ongletId: onglet.id }))
    } catch {
      erreurServeur()
      return
    }
    await afficher()
  })

  // La demande d'accès doit partir d'un clic de l'utilisateur, d'où le bouton
  element('autoriserAcces').addEventListener('click', async () => {
    await chrome.permissions.request(TOUS_LES_SITES)
    await afficher()
  })

  await afficher()
}

// Dans le navigateur seulement : les tests appellent initialiser() eux-mêmes
if (globalThis.chrome?.runtime?.id) initialiser()
