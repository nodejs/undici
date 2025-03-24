export function modalOpen (content) {
  let modal = document.getElementById('modal')
  if (!modal) {
    modal = document.createElement('div')
    modal.classList.add('modal')
    modal.id = 'modal'
  }
  modal.classList.add('modal-open')
  modal.innerHTML = content
  const closeButton = document.createElement('button')
  const closeText = document.createTextNode('❎')
  closeButton.appendChild(closeText)
  closeButton.classList.add('modal-exit')
  closeButton.addEventListener('click', function (event) {
    event.preventDefault()
    modal.classList.remove('modal-open')
  })
  modal.appendChild(closeButton)
  document.body.appendChild(modal)
  document.onkeydown = function (evt) {
    evt = evt || window.event
    if (evt.key === 'Escape' || evt.key === 'Esc') {
      modal.classList.remove('modal-open')
      document.onkeydown = function () {}
    }
  }
}
