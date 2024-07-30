           Set<ObjectName> mbeans = mbsc.queryNames(locatorObjectName, null);

            for (ObjectName mbean : mbeans) {
                // Retrieve and print the attributes of the locator MBean
                String memberName = (String) mbsc.getAttribute(mbean, "Member");
                String host = (String) mbsc.getAttribute(mbean, "Host");
                int port = (Integer) mbsc.getAttribute(mbean, "Port");

                System.out.println("Member Name: " + memberName);
                System.out.println("Host: " + host);
                System.out.println("Port: " + port);
            }
