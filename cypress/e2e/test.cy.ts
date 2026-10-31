describe('KEZMOTO landing', () => {
  it('shows the brand lockup and the unit preview grid', () => {
    cy.visit('/');
    cy.contains('.brandmark__word', 'KEZ');
    cy.contains('.brandmark__tagline', 'BUY. SELL. RIDE.');
    cy.contains('Recently listed');
    cy.get('.unit-card').should('have.length.greaterThan', 0);
  });

  it('reaches the login screen from the top bar', () => {
    cy.visit('/');
    cy.contains('ion-button', 'Log in').click();
    cy.contains('Welcome back');
  });
});
