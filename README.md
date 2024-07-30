            for (ObjectName mbean : mbeans) {
                // Retrieve and print all attributes of the locator MBean
                MBeanInfo mBeanInfo = mbsc.getMBeanInfo(mbean);
                MBeanAttributeInfo[] attributes = mBeanInfo.getAttributes();
                
                System.out.println("Attributes of MBean: " + mbean.getCanonicalName());
                for (MBeanAttributeInfo attributeInfo : attributes) {
                    String attributeName = attributeInfo.getName();
                    try {
                        Object attributeValue = mbsc.getAttribute(mbean, attributeName);
                        System.out.println(attributeName + ": " + attributeValue);
                    } catch (Exception e) {
                        System.out.println("Failed to retrieve value for attribute: " + attributeName);
                        e.printStackTrace();
                    }
                }
                System.out.println();
            }
