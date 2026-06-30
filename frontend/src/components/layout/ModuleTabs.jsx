import { Nav, Tab } from 'react-bootstrap';

export default function ModuleTabs({ activeKey, onSelect, tabs, children }) {
  return (
    <div className="module-tabs-card">
      <Tab.Container activeKey={activeKey} onSelect={onSelect}>
        <Nav variant="tabs" className="module-tabs app-nav-tabs-scroll flex-nowrap">
          {tabs.map((tab) => (
            <Nav.Item key={tab.key}>
              <Nav.Link eventKey={tab.key}>
                {tab.icon && <i className={`bi ${tab.icon} me-2`} />}
                {tab.label}
                {tab.badge != null && (
                  <span className="module-tab-badge">{tab.badge}</span>
                )}
              </Nav.Link>
            </Nav.Item>
          ))}
        </Nav>
        <div className="module-tab-content">
          <Tab.Content>{children}</Tab.Content>
        </div>
      </Tab.Container>
    </div>
  );
}
