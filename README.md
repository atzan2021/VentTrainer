# VentTrainer
A web based simulator of a ventilator and the ventilated patient, in order to experiment with ventilator settings

## about this application

This application is intended as a training tool especially to understand and learn to interpret ventilation waveforms. 

This simulator is not intended for clinical decision making or as part of any patient care process nor are any patient values clinically representative. The simulator uses a simple single compartment lung model, which is appropriate for educational purposes but does not represent very well a real lung.

## It is important to keep the following in mind:

Changing ventilation settings has immediate effect, unlike actual ventilators. There is no constrain checker for setttings. For example it is possible to set a reate of 50 bmp and inspiratory time of 2 seconds which is physically impossible.

Triggered beaths are indicated underneath the airway pressure waveform

It is possible to toggle display of the alveaolar pressure superimposed with the airway pressure. This is important in order to understand the interaction of the ventilator with the ventilator and the involved time constants

The real time monitored values are typically not shown on a real ventilator and they are displayed in faded type for debugging purposes
In a real ventilator breath rate, exhaled minute volume and I:E ratio are running averages. in this sumulation they are calculated breath by breath


[Start the simulator](ventrainter.html) 
